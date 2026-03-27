const PROMPTS = {
  conservative: `You are a lenient photo quality expert. Only flag photos with severe issues.`,
  balanced: `You are a photo quality expert.`,
  aggressive: `You are a strict photo quality expert. Flag any photo with minor issues.`
}

export async function analyzePhoto(imagePath, imageBase64, settings = {}) {
  const { model = 'moondream2', strictness = 'balanced' } = settings
  const tone = PROMPTS[strictness] || PROMPTS.balanced

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model,
        prompt: `${tone} Analyze this photo and respond ONLY with a valid JSON object, no markdown, no explanation, nothing else:
{
  "quality_score": <integer 1-10>,
  "issues": [<zero or more from: "eyes_closed", "someone_not_looking", "blurry", "bad_lighting", "overexposed", "underexposed", "obscured_faces">],
  "category": "<one of: selfie, group_photo, landscape, food, screenshot, document, pet, other>",
  "people_count": <integer>,
  "recommendation": "<keep or delete or review>",
  "reason": "<one short sentence max>"
}`,
        images: [imageBase64],
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`)
    }

    const data = await response.json()
    const raw = data.response || ''
    // Strip any markdown fences
    const clean = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()

    // Try to extract JSON from the response even if there's extra text
    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const parsed = JSON.parse(jsonMatch[0])

    // Normalize
    return {
      quality_score: Math.min(10, Math.max(1, parseInt(parsed.quality_score) || 5)),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      category: parsed.category || 'other',
      people_count: parseInt(parsed.people_count) || 0,
      recommendation: ['keep', 'delete', 'review'].includes(parsed.recommendation) ? parsed.recommendation : 'review',
      reason: parsed.reason || 'No reason provided'
    }
  } catch (err) {
    console.warn('analyzePhoto failed:', err.message)
    return {
      quality_score: 5,
      issues: [],
      category: 'other',
      people_count: 0,
      recommendation: 'review',
      reason: 'AI could not analyze'
    }
  }
}
