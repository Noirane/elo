// Edge Function "ideias": gera sugestões de "puxar assunto" com a IA da Groq.
// Recebe só o tópico (nunca a conversa) e guarda o resultado para reaproveitar com todo mundo.
// Publicar: supabase functions deploy ideias
// Chave: supabase secrets set GROQ_API_KEY=...
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { topicId, lang } = await req.json();
    if (!topicId || !['pt', 'en'].includes(lang)) return json({ error: 'bad_request' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // só pessoas logadas
    const auth = req.headers.get('Authorization') ?? '';
    const { data: who } = await admin.auth.getUser(auth.replace('Bearer ', ''));
    if (!who?.user) return json({ error: 'auth' }, 401);

    const { data: cached } = await admin.from('idea_cache').select('ideas, created_at').eq('topic_id', topicId).eq('lang', lang).maybeSingle();
    const fresh = cached && Date.now() - new Date(cached.created_at).getTime() < 7 * 24 * 3600 * 1000;
    if (fresh) return json({ ideas: cached.ideas });

    const { data: topic } = await admin.from('topics').select('title, category, description').eq('id', topicId).single();
    if (!topic) return json({ error: 'not_found' }, 404);

    const prompt = lang === 'pt'
      ? `Crie 8 perguntas curtas, leves e abertas para duas pessoas que acabaram de se conhecer começarem a conversar sobre "${topic.title}" (categoria: ${topic.category}). Sem spoilers pesados, sem temas sensíveis, no máximo 90 caracteres cada. Responda só com um JSON: {"ideas": ["..."]}.`
      : `Write 8 short, light, open questions for two people who just met to start talking about "${topic.title}" (category: ${topic.category}). No heavy spoilers, no sensitive topics, at most 90 characters each. Reply only with JSON: {"ideas": ["..."]}.`;

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) return json({ error: 'ai_unavailable' }, 502);
    const out = await r.json();
    const parsed = JSON.parse(out.choices?.[0]?.message?.content ?? '{}');
    const ideas: string[] = (parsed.ideas ?? []).filter((s: unknown) => typeof s === 'string' && s.length <= 120).slice(0, 8);
    if (!ideas.length) return json({ error: 'empty' }, 502);

    await admin.from('idea_cache').upsert({ topic_id: topicId, lang, ideas, created_at: new Date().toISOString() });
    return json({ ideas });
  } catch {
    return json({ error: 'server' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
