const STRICTNESS = {
  conservative: {
    threshold: `Only recommend "delete" for clearly ruined photos: severely blurry, completely dark/blown out, accidental shots, or exact duplicates. When in doubt, keep.`,
    score_guide: `Score 1-3: completely unusable. Score 4-5: significant problems. Score 6-7: minor issues. Score 8-10: good to excellent.`
  },
  balanced: {
    threshold: `Recommend "delete" for photos with clear technical failures or that add no value. Recommend "keep" for photos with good subject, acceptable sharpness, and decent exposure. Use "review" when it could go either way.`,
    score_guide: `Score 1-3: unusable. Score 4-5: poor quality. Score 6-7: acceptable. Score 8-10: good to excellent.`
  },
  aggressive: {
    threshold: `Be strict. Recommend "delete" for anything with blur, poor composition, bad lighting, duplicates, unflattering angles, or minor technical issues. Only "keep" clearly good photos.`,
    score_guide: `Score 1-4: delete. Score 5-6: review. Score 7-10: keep.`
  }
}

const SYSTEM = `You are an expert photo curator helping someone clean up their photo library. Examine the image carefully and assess its technical and artistic quality.

Key quality factors to check:
- SHARPNESS: Is the main subject in focus? Is there motion blur?
- EXPOSURE: Is it properly exposed, or too dark/bright/washed out?
- COMPOSITION: Is the subject well-framed? Are important parts cut off?
- FACES (if present): Are eyes open and in focus? Are people looking at camera or naturally posed?
- VALUE: Does this photo capture a meaningful moment, or is it a duplicate/accident/screenshot?

Respond ONLY with a JSON object — no explanation, no markdown.`

export async function analyzePhoto(imagePath, imageBase64, settings = {}) {
  const { model = 'moondream2', strictness = 'balanced' } = settings
  const { threshold, score_guide } = STRICTNESS[strictness] || STRICTNESS.balanced

  const prompt = `${SYSTEM}

Decision rule: ${threshold}
Scoring: ${score_guide}

Respond with exactly this JSON structure:
{"quality_score":<1-10>,"recommendation":"<keep|delete|review>","reason":"<one specific sentence about the main factor>","issues":<[]|["blurry","eyes_closed","bad_exposure","bad_framing","accidental","duplicate","dark","overexposed","subject_missing"]>,"category":"<selfie|group|portrait|landscape|food|screenshot|document|pet|object|other>","has_people":<true|false>}`

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model,
        prompt,
        images: [imageBase64],
        stream: false,
        options: {
          temperature: 0.1,  // low temp = more consistent, less hallucination
          num_predict: 200   // thumbnails don't need long responses
        }
      })
    })

    if (!response.ok) throw new Error(`Ollama ${response.status}`)

    const data = await response.json()
    const raw = (data.response || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const p = JSON.parse(jsonMatch[0])

    return {
      quality_score:  Math.min(10, Math.max(1, parseInt(p.quality_score) || 5)),
      recommendation: ['keep', 'delete', 'review'].includes(p.recommendation) ? p.recommendation : 'review',
      reason:         typeof p.reason === 'string' && p.reason.length > 0 ? p.reason : 'No reason provided',
      issues:         Array.isArray(p.issues) ? p.issues : [],
      category:       typeof p.category === 'string' ? p.category : 'other',
      people_count:   p.has_people ? 1 : 0,  // simplified — models guess count poorly
    }
  } catch (err) {
    console.warn('analyzePhoto failed:', err.message)
    return {
      quality_score: 5, recommendation: 'review', reason: 'Could not analyze',
      issues: [], category: 'other', people_count: 0
    }
  }
}
