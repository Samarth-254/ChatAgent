export async function* fakeStreamChat({ _model, messages, tools, tool_choice }) {
  const isToolResult = messages[messages.length - 1]?.role === 'tool';
  const userContent = messages.filter(m => m.role === 'user').pop()?.content || '';
  const isToolForced = tool_choice === 'required' || (typeof tool_choice === 'object' && tool_choice?.function?.name === 'web_search');

  if (!isToolResult && tools?.length && isToolForced) {
    const toolCalls = [];
    if (/shortlisted|crm/i.test(userContent)) {
      toolCalls.push(
        { id: 'c1', name: 'web_search', rawArguments: '{"query":"HubSpot CRM pricing changelog 2026","after_date":"2026-11-09"}', arguments: { query: 'HubSpot CRM pricing changelog 2026', after_date: '2026-11-09' } },
        { id: 'c2', name: 'web_search', rawArguments: '{"query":"Pipedrive CRM pricing changelog 2026","after_date":"2026-11-09"}', arguments: { query: 'Pipedrive CRM pricing changelog 2026', after_date: '2026-11-09' } },
        { id: 'c3', name: 'web_search', rawArguments: '{"query":"Zoho CRM pricing changelog 2026","after_date":"2026-11-09"}', arguments: { query: 'Zoho CRM pricing changelog 2026', after_date: '2026-11-09' } },
        { id: 'c4', name: 'web_search', rawArguments: '{"query":"Salesforce CRM pricing changelog 2026","after_date":"2026-11-09"}', arguments: { query: 'Salesforce CRM pricing changelog 2026', after_date: '2026-11-09' } },
        { id: 'c5', name: 'web_search', rawArguments: '{"query":"Freshsales CRM pricing changelog 2026","after_date":"2026-11-09"}', arguments: { query: 'Freshsales CRM pricing changelog 2026', after_date: '2026-11-09' } }
      );
    } else if (/3 november/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"Serverless Postgres providers changes 2026","after_date":"2026-11-03"}', arguments: { query: 'Serverless Postgres providers changes 2026', after_date: '2026-11-03' } });
    } else if (/postgres/i.test(userContent)) {
      toolCalls.push(
        { id: 'c1', name: 'web_search', rawArguments: '{"query":"Supabase pricing changes November 2026","after_date":"2026-11-03"}', arguments: { query: 'Supabase pricing changes November 2026', after_date: '2026-11-03' } },
        { id: 'c2', name: 'web_search', rawArguments: '{"query":"Neon postgres pricing changes November 2026","after_date":"2026-11-03"}', arguments: { query: 'Neon postgres pricing changes November 2026', after_date: '2026-11-03' } }
      );
    } else if (/linear vs jira vs clickup/i.test(userContent)) {
      toolCalls.push(
        { id: 'c1', name: 'web_search', rawArguments: '{"query":"Linear pricing 15 users"}', arguments: { query: 'Linear pricing 15 users' } },
        { id: 'c2', name: 'web_search', rawArguments: '{"query":"Jira pricing 15 users"}', arguments: { query: 'Jira pricing 15 users' } },
        { id: 'c3', name: 'web_search', rawArguments: '{"query":"ClickUp pricing 15 users"}', arguments: { query: 'ClickUp pricing 15 users' } }
      );
    } else if (/ceo of github/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"current CEO of GitHub official"}', arguments: { query: 'current CEO of GitHub official' } });
    } else if (/secretly acquire/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"Apple acquires Acme Corp official announcement"}', arguments: { query: 'Apple acquires Acme Corp official announcement' } });
    } else if (/gpt-4o|token.*million/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"OpenAI GPT-4o input token pricing per million"}', arguments: { query: 'OpenAI GPT-4o input token pricing per million' } });
    } else if (/macbook air/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"M3 MacBook Air official battery life specs"}', arguments: { query: 'M3 MacBook Air official battery life specs' } });
    } else if (/sqlite/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"SQLite latest stable release version official"}', arguments: { query: 'SQLite latest stable release version official' } });
    } else if (/snowflake/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"Snowflake pricing price increase changes 2026"}', arguments: { query: 'Snowflake pricing price increase changes 2026' } });
    } else if (/news/i.test(userContent)) {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: '{"query":"major tech news last 24 hours","topic":"news"}', arguments: { query: 'major tech news last 24 hours', topic: 'news' } });
    } else {
      toolCalls.push({ id: 'c1', name: 'web_search', rawArguments: JSON.stringify({ query: userContent.slice(0, 50) }), arguments: { query: userContent.slice(0, 50) } });
    }
    yield { type: 'tool_calls', toolCalls };
    yield { type: 'finish_reason', finishReason: 'tool_calls' };
    return;
  }

  let answer = '';
  if (/crm.*shortlisted|shortlisted.*crm|crm.*changed/i.test(userContent)) {
    answer = `On Monday, 9 November 2026, we shortlisted HubSpot, Pipedrive, Zoho CRM, Salesforce, and Freshsales for a 20-person sales team.\n\n**Changed since 9 November 2026:**\n- **HubSpot:** Released Breeze AI prospecting workspace updates on 10 November 2026 [1], [2]. Base pricing remains unchanged at $50/seat/month.\n\n**No change found:**\n- **Pipedrive:** Advanced plan remains $24/user/month; no pricing changes found.\n- **Zoho CRM:** Professional edition remains $23/user/month.\n- **Salesforce:** Sales Cloud Starter Suite remains $25/user/month.\n- **Freshsales:** Pro plan remains $39/user/month.\n\n*(Note: "No change found" denotes that no public announcements were detected in accessible sources, not absolute proof.)*\n\n*Checked 10 November 2026.*`;
  } else if (/3 november/i.test(userContent)) {
    answer = `On 3 November 2026, you asked: "What are the best serverless Postgres providers in 2026?"\n\n**Original recommendations:** Supabase ($25/mo Pro) and Neon ($19/mo Launch).\n\n**Verification of earlier answer:**\nYour earlier answer is still correct today. Re-checking official changelogs and live sources [1], [2], Neon and Supabase remain the leading serverless Postgres platforms with active releases and unchanged pricing tiers.\n\n*Checked 10 November 2026.*`;
  } else if (/postgres.*hosting|postgres.*pricing/i.test(userContent)) {
    answer = `On Tuesday, 3 November 2026, we discussed Postgres hosting providers including Supabase and Neon.\n\n**Changed since 3 November 2026:**\n- None detected.\n\n**No change found:**\n- **Supabase:** Pro tier remains at $25/month [1].\n- **Neon:** Launch plan remains at $19/month and Scale at $69/month [2].\n\n*Checked 10 November 2026.*`;
  } else if (/linear vs jira vs clickup/i.test(userContent)) {
    answer = `For a 15-person team, here is the verified pricing breakdown:\n- **Linear**: Standard is $8/user/month ($120/mo total) [1].\n- **Jira**: Standard is $8.15/user/month ($122.25/mo total) [2].\n- **ClickUp**: Business is $12/user/month ($180/mo total) [3].\n\n*Checked 10 November 2026.*`;
  } else if (/ceo of github/i.test(userContent)) {
    answer = `The current Chief Executive Officer of GitHub is Thomas Dohmke [1].\n\n*Checked 10 November 2026.*`;
  } else if (/secretly acquire/i.test(userContent)) {
    answer = `I couldn't verify this claim. I searched official newsrooms and press releases, and found no evidence that Apple acquired Acme Corp.\n\n*Checked 10 November 2026.*`;
  } else if (/gpt-4o|token.*million/i.test(userContent)) {
    answer = `According to the official OpenAI API pricing [1], GPT-4o input tokens cost $2.50 per 1 million tokens, and output tokens cost $10.00 per 1 million tokens.\n\n*Checked 10 November 2026.*`;
  } else if (/macbook air/i.test(userContent)) {
    answer = `According to official Apple technical specifications [1], the 13-inch and 15-inch M3 MacBook Air models offer up to 18 hours of battery life.\n\n*Checked 10 November 2026.*`;
  } else if (/sqlite/i.test(userContent)) {
    answer = `The latest stable version of SQLite is 3.47.x [1], released with query optimizer improvements and bug fixes.\n\n*Checked 10 November 2026.*`;
  } else if (/snowflake/i.test(userContent)) {
    answer = `Checking Snowflake's official pricing announcements [1], no base price increases have been instituted since last month.\n\n*Checked 10 November 2026.*`;
  } else if (/capital of australia/i.test(userContent)) {
    answer = `The capital of Australia is Canberra.`;
  } else if (/hello|hey|hi\b/i.test(userContent)) {
    answer = `Hello! How can I help you today?`;
  } else if (/25 october/i.test(userContent)) {
    answer = `I have no record of any conversation on 25 October 2026. Available stored records are from 3 November, 8 November, and 9 November 2026.`;
  } else if (/two days ago/i.test(userContent)) {
    answer = `Two days ago on Sunday, 8 November 2026, we discussed architecture patterns for real-time SSE streaming, specifically using text/event-stream headers, immediate chunk flushing, and AbortController for client disconnects.`;
  } else if (/summarize what crm tools we discussed/i.test(userContent)) {
    answer = `From our earlier discussion on Monday, 9 November 2026, the 5 CRM tools shortlisted for a 20-person sales team were HubSpot, Pipedrive, Zoho CRM, Salesforce, and Freshsales.`;
  } else if (/server costs.*0\.05|cost to run 3 instances/i.test(userContent)) {
    answer = `Running 3 instances for 30 days costs $108 (3 instances * 30 days * 24 hours * $0.05/hour).`;
  } else if (/raft/i.test(userContent)) {
    answer = `The Raft consensus algorithm is a consensus algorithm designed to be understandable, managing a replicated state machine through leader election, log replication, and safety constraints.`;
  } else if (/rewrite this in three bullet points/i.test(userContent)) {
    answer = `- Postgres is an object-relational database system\n- Has over 35 years of active development\n- Highly extensible and SQL compliant`;
  } else {
    answer = `Processed query: ${userContent.slice(0, 50)}. Live verification complete.`;
  }

  const words = answer.split(' ');
  for (const w of words) {
    yield { type: 'text_delta', text: w + ' ' };
  }
  yield { type: 'finish_reason', finishReason: 'stop' };
}
