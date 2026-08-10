# 2030 HUNTER — OpenAI Edition

Single SCAN NOW UI backed by one Vercel Node serverless function.

Required Vercel Environment Variable:
`OPENAI_API_KEY`

The function uses the OpenAI Responses API with `o3-deep-research`, background execution, and web search. The API key is server-side only and is never sent to the browser.

The Hunter prompt is stored in `config.json` and uses the 10X-focused Hunter Score.
