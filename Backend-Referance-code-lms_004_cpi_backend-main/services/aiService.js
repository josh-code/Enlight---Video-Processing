const OpenAI = require('openai')
const config = require('config')
const { AI_GENERATION } = require('../contant')

class AIService {
	constructor() {
		this.openai = new OpenAI({
			apiKey: config.get('OPENAI_API_KEY'),
		})
	}

	/**
	 * Estimate token count for text (rough approximation)
	 * OpenAI uses a more sophisticated tokenizer, but this gives us a good estimate
	 * @param {string} text - The text to estimate tokens for
	 * @returns {number} - Estimated token count
	 */
	estimateTokenCount(text) {
		if (!text) return 0

		// Rough estimation: 1 token ≈ 4 characters for English text
		// This is a conservative estimate
		return Math.ceil(text.length / 4)
	}

	/**
	 * Generate session title AND description from transcription in a single API call
	 * This is more efficient than making separate calls for each field
	 * @param {string} transcription - The transcription text
	 * @param {string} language - Language code (en, es)
	 * @returns {Promise<{title: string, description: string}>}
	 */
	async generateSessionContent(transcription, language = 'en') {
		try {
			if (!transcription || transcription.trim().length === 0) {
				throw new Error('Transcription is required and cannot be empty')
			}

			// Estimate token count for the entire request
			const transcriptionTokens = this.estimateTokenCount(transcription)
			const promptTokens = AI_GENERATION.PROMPT_TOKENS
			const maxOutputTokens = AI_GENERATION.MAX_OUTPUT_TOKENS
			const estimatedTotalTokens =
				transcriptionTokens + promptTokens + maxOutputTokens

			if (estimatedTotalTokens > AI_GENERATION.OPENAI_CONTEXT_LIMIT) {
				// OpenAI's hard limit♣
				throw new Error(
					`Transcription too long. Estimated ${estimatedTotalTokens} tokens exceeds the ${constants.AI_GENERATION.OPENAI_CONTEXT_LIMIT} token limit.`
				)
			}

			const languageName = language === 'es' ? 'Spanish' : 'English'

			const prompt = `You are an expert course content creator. Based on the following transcription of a video/audio session, generate:

1. A concise, engaging title (STRICTLY maximum ${AI_GENERATION.MAX_TITLE_LENGTH} characters) that captures the main topic
2. A comprehensive description (minimum ${AI_GENERATION.MIN_DESCRIPTION_LENGTH} characters, aim for ${AI_GENERATION.TARGET_DESCRIPTION_LENGTH.MIN}-${AI_GENERATION.TARGET_DESCRIPTION_LENGTH.MAX} characters) that summarizes the key points, learning objectives, and provides valuable insights

Requirements:
- Title should be clear, professional, and SEO-friendly
- Title MUST be ${AI_GENERATION.MAX_TITLE_LENGTH} characters or less - this is a hard requirement
- Description should be detailed, informative, and encourage learning
- Both should be in ${languageName}
- Title max: ${AI_GENERATION.MAX_TITLE_LENGTH} characters (STRICT LIMIT)
- Description min: ${AI_GENERATION.MIN_DESCRIPTION_LENGTH} characters, aim for ${AI_GENERATION.TARGET_DESCRIPTION_LENGTH.MIN}-${AI_GENERATION.TARGET_DESCRIPTION_LENGTH.MAX} characters

Markdown Formatting Rules for Description:
- Use **bold** for important concepts, key terms, and main points
- Use *italic* for emphasis and secondary points
- Use __underline__ for critical information and action items
- NO other markdown formatting allowed (no lists, links, headers, etc.)
- Keep formatting clean and professional

Description Structure:
- Start with a compelling overview
- Include 4-6 key learning points
- Mention specific benefits or outcomes

Transcription:
${transcription}

Please respond in this exact JSON format:
{
  "title": "Generated Title Here (max 75 chars)",
  "description": "Generated Description Here with **bold**, *italic*, and __underline__ formatting"
}

Example of a good title (under ${AI_GENERATION.MAX_TITLE_LENGTH} chars):
"Prayer Power: Transform Your Ministry" (47 chars)
"Strategic Prayer Habits for Leaders" (42 chars)
"Building a Prayer Foundation" (32 chars)`

			const completion = await this.openai.chat.completions.create({
				model: 'gpt-3.5-turbo',
				messages: [
					{
						role: 'system',
						content:
							'You are a helpful assistant that generates course content titles and descriptions based on transcriptions. Always respond with valid JSON. Use markdown formatting as specified in the prompt.',
					},
					{
						role: 'user',
						content: prompt,
					},
				],
				temperature: 0.7,
				max_tokens: AI_GENERATION.MAX_OUTPUT_TOKENS, // Increased to allow for longer, formatted descriptions
			})

			const response = completion.choices[0]?.message?.content

			if (!response) {
				throw new Error('No response from OpenAI')
			}

			// Parse the JSON response - handle markdown-wrapped responses
			let parsedResponse
			try {
				// First, try to parse the response directly
				parsedResponse = JSON.parse(response)
			} catch (parseError) {
				// If direct parsing fails, try to extract JSON from markdown code blocks
				try {
					// Remove markdown code block markers if present
					let cleanResponse = response

					// Remove ```json and ``` markers
					if (cleanResponse.includes('```json')) {
						cleanResponse = cleanResponse
							.replace(/```json\s*/, '')
							.replace(/```\s*$/, '')
					} else if (cleanResponse.includes('```')) {
						cleanResponse = cleanResponse.replace(/```\s*/, '')
					}

					// Clean up any remaining whitespace
					cleanResponse = cleanResponse.trim()

					parsedResponse = JSON.parse(cleanResponse)
				} catch (secondParseError) {
					throw new Error('Invalid response format from AI service')
				}
			}

			// Validate the response structure
			if (!parsedResponse.title || !parsedResponse.description) {
				throw new Error('AI response missing required fields')
			}

			// Validate title length
			if (parsedResponse.title.length > AI_GENERATION.MAX_TITLE_LENGTH) {
				// Truncate title to max characters, trying to break at word boundaries
				let truncatedTitle = parsedResponse.title.substring(
					0,
					AI_GENERATION.MAX_TITLE_LENGTH
				)
				if (
					truncatedTitle.lastIndexOf(' ') >
					AI_GENERATION.MAX_TITLE_LENGTH - 15
				) {
					// Try to break at a word boundary
					truncatedTitle = truncatedTitle.substring(
						0,
						truncatedTitle.lastIndexOf(' ')
					)
				}
				parsedResponse.title =
					truncatedTitle +
					(truncatedTitle.length < AI_GENERATION.MAX_TITLE_LENGTH ? '...' : '')
			}

			// Validate description length
			if (
				parsedResponse.description.length < AI_GENERATION.MIN_DESCRIPTION_LENGTH
			) {
				throw new Error(
					`Generated description is too short. Minimum ${AI_GENERATION.MIN_DESCRIPTION_LENGTH} characters required.`
				)
			}

			return {
				title: parsedResponse.title.trim(),
				description: parsedResponse.description.trim(),
			}
		} catch (error) {
			throw new Error(`AI generation failed: ${error.message}`)
		}
	}
}

module.exports = new AIService()
