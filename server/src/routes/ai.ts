import { Router } from 'express';
const router = Router();
type AiRequest = { provider?: 'openai' | 'local'; baseUrl?: string; apiKey?: string; model?: string; messages?: Array<{ role: string; content: string }>; prompt?: string; temperature?: number };
async function complete(body: AiRequest) {
  const provider = body.provider || 'openai'; const messages = body.messages || [{ role: 'user', content: body.prompt || '' }];
  if (provider === 'local') {
    const base = (body.baseUrl || process.env.LOCAL_LLM_URL || 'http://localhost:11434').replace(/\/$/, '');
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: body.model || process.env.LOCAL_LLM_MODEL || 'qwen2.5', messages, stream: false, options: { temperature: body.temperature ?? 0.2 } }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || `本地模型错误 ${response.status}`); return { content: payload.message?.content || '', model: payload.model };
  }
  const base = (body.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''); const apiKey = body.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENAI_API_KEY');
  const response = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: body.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini', messages, temperature: body.temperature ?? 0.2 }) });
  const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || `LLM API 错误 ${response.status}`); return { content: payload.choices?.[0]?.message?.content || '', model: payload.model, usage: payload.usage };
}
router.post('/chat', async (req, res) => { try { res.json(await complete(req.body)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); } });
router.post('/query', async (req, res) => { try { const schema = JSON.stringify(req.body.schema || []); res.json(await complete({ ...req.body, messages: [{ role: 'system', content: '将自然语言转换为只读 SQL。只输出 SQL，不要 Markdown。' }, { role: 'user', content: `表结构：${schema}\n问题：${req.body.question}` }] })); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); } });
router.post('/insight', async (req, res) => { try { const sample = JSON.stringify((req.body.rows || []).slice(0, 100)); res.json(await complete({ ...req.body, messages: [{ role: 'system', content: '你是数据分析师。总结趋势、异常，并给出可能解释，使用简洁中文。' }, { role: 'user', content: sample }] })); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); } });
export { router as aiRouter };
