// main.ts

// --- 全局配置 ---
// 重要提示：在生产环境中，请务必使用 Deno.env.get() 从环境变量中读取敏感信息！
// 本地测试时，你可以直接在此处设置，或使用 .env 文件。

// 上游 CodeGPT 服务的 API 地址
const CODEGPT_API_URL = Deno.env.get("CODEGPT_API_URL") || "https://api.codegpt.co/api/v1/chat/completions";
// 你的 CodeGPT Agent ID
const CODEGPT_AGENT_ID = Deno.env.get("CODEGPT_AGENT_ID") || "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"; // 替换成你的 Agent ID
// 你的 CodeGPT Org ID
const CODEGPT_ORG_ID = Deno.env.get("CODEGPT_ORG_ID") || "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";     // 替换成你的 Org ID
// 你的 CodeGPT API 密钥
const CODEGPT_API_KEY = Deno.env.get("CODEGPT_API_KEY") || "sk-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";   // 替换成你的 CodeGPT API Key

// 用于访问我们自己这个代理服务的有效 API 密钥
const VALID_API_KEY = Deno.env.get("VALID_API_KEY") || "xxxxxxxxxxxxxxxxxxxxxxx"; // 替换成你想设置的、用于保护本服务的密钥

// --- 【新增】模型列表 ---
// 在这里定义你的服务所支持的所有模型。
// 客户端（如 Cherry Studio）将通过 /v1/models 接口获取这个列表。
// 若要增删模型，直接修改这个数组即可。
const MY_MODELS: string[] = [
    "deepseek-r1-bedrock", "gpt-4-turbo", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k", "gpt-4.1", "gpt-4", "claude-4-sonnet-bedrock",
    "claude-4-sonnet-thinking-bedrock", "claude-3.5-sonnet-anthropic", "claude-3.7-sonnet-anthropic",
    "claude-3.7-sonnet-thinking-anthropic", "claude-3.7-bedrock", "claude-3.7-thinking-bedrock",
    "claude-3.5-haiku-bedrock", "claude-2.1", "claude-instant-1.2", "claude-3-sonnet",
    "claude-3.5-sonnet", "llama-4-maverick-17b-128e-instruct-maas-vertex", "claude-3.7-vertex",
    "claude-3.7-thinking-vertex", "claude-3-5-sonnet-vertex", "claude-3-5-haiku-vertex",
    "gemini-1.0-pro", "gemini-1.5-pro-latest", "gemini-1.5-flash", "gemini-2.5-pro-vertex",
    "gemini-2.5-flash-vertex", "gemini-2.0-flash-vertex", "gemini-2.0-flash-generative-ai",
    "gemini-2.0-flash-thinking-exp-1219-generative-ai", "llama-4-scout-17b-cf", "llama3-70b",
    "llama-3.1-70b", "llama-3.1-405b", "command-r-plus", "mistral-large-2", "o3-mini",
    "o1-preview", "o1-mini", "deepseek-reasoner-r1", "llama-3.1-8b-cerebras",
    "llama-3.3-70b-cerebras", "deepSeek", "llama-4-scout-17b-cerebras", "llama-4-scout-meta",
    "llama-4-maverick-meta"
];

// --- TypeScript 接口定义 ---
// 这些接口定义了符合 OpenAI API 规范的数据结构，用于类型检查和代码提示。

// 消息结构
interface Message {
    role: string;
    content: string;
}

// 聊天补全请求体结构
interface ChatCompletionRequest {
    model?: string;
    messages: Message[];
    max_tokens?: number | null;
    temperature?: number | null;
    top_p?: number | null;
    n?: number | null;
    stream?: boolean | null;
    stop?: string[] | null;
    presence_penalty?: number | null;
    frequency_penalty?: number | null;
    logit_bias?: Record<string, number> | null;
    user?: string | null;
}

// Token 使用量结构
interface Usage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

// 非流式响应中的选项结构
interface Choice {
    index: number;
    message: Message;
    finish_reason?: string | null;
}

// 非流式聊天补全响应体结构
interface ChatCompletionResponse {
    id: string;
    object: string; // 固定为 "chat.completion"
    created: number;
    model: string;
    choices: Choice[];
    usage: Usage;
}

// 流式响应中的选项增量结构
interface StreamChoice {
    index: number;
    delta: Record<string, any>; // 增量内容，如 { "content": "hello" }
    finish_reason?: string | null;
}

// 流式聊天补全响应体结构
interface ChatCompletionStreamResponse {
    id: string;
    object: string; // 固定为 "chat.completion.chunk"
    created: number;
    model: string;
    choices: StreamChoice[];
}

// --- 身份验证函数 ---
/**
 * 验证请求头中的 API 密钥。
 * @param request - Deno 的请求对象
 * @returns 如果验证失败，返回一个 Response 对象；如果成功，返回 null。
 */
function verifyApiKey(request: Request): Response | null {
    const authorization = request.headers.get("Authorization");

    if (!authorization) {
        return new Response("缺少 authorization 请求头", { status: 401 });
    }

    if (!authorization.startsWith("Bearer ")) {
        return new Response("无效的 authorization 格式，应为 'Bearer sk-...' ", { status: 401 });
    }

    const apiKey = authorization.substring(7); // 移除 "Bearer " 前缀
    if (apiKey !== VALID_API_KEY) {
        return new Response("无效的 API 密钥", { status: 401 });
    }
    return null; // 验证通过
}

// --- 辅助函数 ---

/**
 * 解析来自 CodeGPT 流式响应的单行数据。
 * @param line - 从流中读取的一行字符串
 * @returns 解析后的 JSON 对象，或在特定情况下返回 null 或 { done: true }
 */
function parseCodegptStreamLine(line: string): Record<string, any> | null {
    line = line.trim();
    if (!line || !line.startsWith("data: ")) {
        return null; // 忽略空行或格式不符的行
    }

    try {
        const dataStr = line.substring(6); // 移除 "data: " 前缀
        if (dataStr === "[DONE]") {
            return { done: true }; // CodeGPT 流结束的标志
        }
        return JSON.parse(dataStr);
    } catch (e) {
        console.error("解析 CodeGPT 流数据行时出错:", e);
        return null;
    }
}

/**
 * 将 CodeGPT 的流式数据块转换为 OpenAI 兼容的流式数据块格式。
 * @param codegptData - 从 CodeGPT 流解析出的数据对象
 * @param requestId - 本次请求的唯一 ID
 * @param model - 本次请求使用的模型名称
 * @returns 格式化后的 OpenAI 流式数据字符串 (例如 "data: {...}\n\n")，或 null
 */
function convertCodegptToOpenAIStream(
    codegptData: Record<string, any>,
    requestId: string,
    model: string
): string | null {
    if (codegptData.done) {
        // CodeGPT 流结束了，但 OpenAI 规范要求我们发送一个带有 finish_reason 的最终块
        const finalChunk: ChatCompletionStreamResponse = {
            id: requestId,
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
        };
        return `data: ${JSON.stringify(finalChunk)}\n\n`;
    }

    const choices = codegptData.choices || [];
    if (!choices.length) return null; // 如果这个数据块没有内容，则跳过

    const choice = choices[0];
    const delta = choice.delta || {};
    const contents = delta.contents || [];
    const finishReason = choice.finish_reason;

    // 提取文本内容
    let textContent = "";
    if (Array.isArray(contents)) {
        for (const contentItem of contents) {
            if (typeof contentItem === 'object' && contentItem !== null && contentItem.type === "text") {
                textContent += contentItem.content || "";
            }
        }
    }
    if (!textContent && typeof delta.content === 'string') {
        textContent = delta.content; // 兼容其他可能的格式
    }

    const shouldSendChunk = Boolean(textContent) || Boolean(finishReason);
    if (shouldSendChunk) {
        const openaiDelta: Record<string, any> = {};
        if (textContent) openaiDelta.content = textContent;

        const chunk: ChatCompletionStreamResponse = {
            id: requestId,
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{ index: 0, delta: openaiDelta, finish_reason: finishReason }]
        };
        return `data: ${JSON.stringify(chunk)}\n\n`; // 返回符合 SSE 规范的字符串
    }

    return null;
}

/**
 * 异步生成器，用于处理完整的 CodeGPT 流式响应，并将其逐块转换为 OpenAI 流。
 * @param codegptResponse - 从 CodeGPT API 收到的原始 Response 对象
 * @param requestId - 本次请求的唯一 ID
 * @param model - 本次请求使用的模型名称
 */
async function* streamCodegptResponse(codegptResponse: Response, requestId: string, model: string): AsyncGenerator<string, void, void> {
    const reader = codegptResponse.body?.pipeThrough(new TextDecoderStream()).getReader();
    if (!reader) {
        console.error("CodeGPT 响应体不可读。");
        // 返回一个表示错误的流块
        yield `data: {"id":"${requestId}","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"${model}","choices":[{"index":0,"delta":{},"finish_reason":"error"}]}\n\n`;
        yield "data: [DONE]\n\n";
        return;
    }

    try {
        // OpenAI 规范要求流的第一个块包含 role
        const initialChunk: ChatCompletionStreamResponse = {
            id: requestId,
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
        };
        yield `data: ${JSON.stringify(initialChunk)}\n\n`;

        let buffer = ""; // 用于存储不完整的行
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; // 最后一部分可能不完整，留在 buffer 中下次处理

            for (const line of lines) {
                const codegptData = parseCodegptStreamLine(line);
                if (codegptData) {
                    const openaiChunk = convertCodegptToOpenAIStream(codegptData, requestId, model);
                    if (openaiChunk) {
                        yield openaiChunk; // 生成一个转换后的数据块
                    }
                }
            }
        }
        // 处理缓冲区中可能剩余的最后一行
        if (buffer) {
            const codegptData = parseCodegptStreamLine(buffer);
            if (codegptData) {
                const openaiChunk = convertCodegptToOpenAIStream(codegptData, requestId, model);
                if (openaiChunk) yield openaiChunk;
            }
        }

        // 发送 OpenAI 规范的流结束标志
        yield "data: [DONE]\n\n";

    } catch (e) {
        console.error(`流处理中发生错误: ${e}`);
        // 发送一个表示错误的流块
        const errorChunk: ChatCompletionStreamResponse = {
            id: requestId, created: Math.floor(Date.now() / 1000), model: model,
            choices: [{ index: 0, delta: {}, finish_reason: "error" }]
        };
        yield `data: ${JSON.stringify(errorChunk)}\n\n`;
        yield "data: [DONE]\n\n";
    } finally {
        reader.releaseLock();
    }
}

// --- API 端点处理函数 ---

/**
 * 【新增】处理 `GET /v1/models` 请求的函数。
 * @param request - Deno 的请求对象
 * @returns 一个包含模型列表的 JSON 响应。
 */
async function handleModelsList(request: Request): Promise<Response> {
    // 最佳实践：同样使用 API 密钥保护这个端点
    const authError = verifyApiKey(request);
    if (authError) {
        return authError;
    }

    // 将我们的模型ID字符串数组，转换为 OpenAI 要求的标准对象格式
    const modelData = MY_MODELS.map(modelId => ({
        id: modelId,
        object: "model",
        created: Math.floor(Date.now() / 1000), // 使用当前时间戳
        owned_by: "system" // 所属者，通常可以是 "system" 或你自己的标识
    }));

    // 构建最终的、符合 OpenAI 规范的响应体
    const responsePayload = {
        object: "list",
        data: modelData,
    };

    // 返回 JSON 格式的响应
    return new Response(JSON.stringify(responsePayload), {
        headers: { "Content-Type": "application/json" },
    });
}

/**
 * 处理 `POST /v1/chat/completions` 请求，即聊天核心功能。
 * @param request - Deno 的请求对象
 * @returns 聊天响应，可以是流式的也可以是非流式的。
 */
async function handleChatCompletions(request: Request): Promise<Response> {
    const authError = verifyApiKey(request);
    if (authError) {
        return authError;
    }

    let requestBody: ChatCompletionRequest;
    try {
        requestBody = await request.json();
    } catch (e) {
        return new Response("无效的 JSON 请求体", { status: 400 });
    }
    
    // 【重要】检查用户请求的模型是否存在于我们的模型列表中
    const model = requestBody.model || MY_MODELS[0]; // 如果用户没指定，默认使用列表中的第一个
    if (!MY_MODELS.includes(model)) {
        // 如果模型不存在，返回一个标准的 model_not_found 错误
        return new Response(JSON.stringify({
            error: {
                message: `模型 \`${model}\` 不存在。`,
                type: 'invalid_request_error',
                param: 'model',
                code: 'model_not_found'
            }
        }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const stream = requestBody.stream || false;

    // 准备发送给上游 CodeGPT API 的请求载荷 (payload)
    const promptTokens = requestBody.messages.reduce((sum, msg) => sum + msg.content.split(/\s+/).length, 0);
    const codegptPayload = {
        agentId: CODEGPT_AGENT_ID,
        messages: requestBody.messages.map(msg => ({ role: msg.role, content: msg.content })),
        format: "json",
        stream: stream
    };
    const codegptHeaders = {
        "accept": "application/json",
        "CodeGPT-Org-Id": CODEGPT_ORG_ID,
        "content-type": "application/json",
        "authorization": `Bearer ${CODEGPT_API_KEY}`
    };

    const requestId = `chatcmpl-${crypto.randomUUID().replace(/-/g, '')}`;

    try {
        // 向 CodeGPT API 发起请求
        const codegptResponse = await fetch(CODEGPT_API_URL, {
            method: "POST",
            headers: codegptHeaders,
            body: JSON.stringify(codegptPayload),
        });

        if (!codegptResponse.ok) {
            const errorText = await codegptResponse.text();
            console.error(`CodeGPT API 错误 (${codegptResponse.status}): ${errorText}`);
            return new Response(`CodeGPT API 错误: ${errorText}`, { status: codegptResponse.status });
        }

        // 根据请求是否为流式，返回不同的响应
        if (stream) {
            // 返回流式响应
            const readableStream = new ReadableStream({
                async start(controller) {
                    for await (const chunk of streamCodegptResponse(codegptResponse, requestId, model)) {
                        controller.enqueue(new TextEncoder().encode(chunk));
                    }
                    controller.close();
                },
                cancel() {
                    console.log("客户端取消了流式请求。");
                }
            });
            return new Response(readableStream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });
        } else {
            // 处理并返回非流式响应
            let content: string;
            let completionTokens: number = 0;
            try {
                const codegptJson = await codegptResponse.json();
                const choices = codegptJson.choices || [];
                content = choices.length > 0 && choices[0].message ? (choices[0].message.content || "") : "错误：无法从 CodeGPT 响应中提取内容。";
                completionTokens = content.split(/\s+/).length;
            } catch (e) {
                console.error("解码 CodeGPT JSON 响应时出错:", e);
                content = `错误：解码 CodeGPT JSON 响应失败。 ${e}`;
            }

            // 创建 OpenAI 兼容的响应体
            const response: ChatCompletionResponse = {
                id: requestId,
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{ index: 0, message: { role: "assistant", content: content }, finish_reason: "stop" }],
                usage: {
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: promptTokens + completionTokens
                }
            };
            return new Response(JSON.stringify(response), {
                headers: { "Content-Type": "application/json" }
            });
        }

    } catch (e) {
        console.error(`请求失败: ${e}`);
        return new Response(`内部服务器错误: ${e.message || e}`, { status: 500 });
    }
}


/**
 * 主路由函数，所有请求的入口点。
 * 它会根据请求的 HTTP 方法和路径来决定调用哪个处理函数。
 * @param request - Deno 的请求对象
 * @returns 一个 Response 对象
 */
async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // --- 【修改】路由逻辑 ---
    if (request.method === "GET" && url.pathname === "/v1/models") {
        // 1. 如果是 GET 请求且路径是 /v1/models，则调用模型列表处理函数
        return handleModelsList(request);
    } else if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
        // 2. 如果是 POST 请求且路径是 /v1/chat/completions，则调用聊天处理函数
        return handleChatCompletions(request);
    } else if (request.method === "GET" && url.pathname === "/") {
        // 3. 根路径，返回一个简单的欢迎信息和端点列表
        return new Response(JSON.stringify({
            message: "由 CodeGPT 驱动的 OpenAI 兼容 API 服务",
            version: "1.0.0",
            endpoints: {
                models: "/v1/models", // 告知用户有这个端点
                chat_completions: "/v1/chat/completions"
            }
        }), { headers: { "Content-Type": "application/json" } });
    } else if (request.method === "GET" && url.pathname === "/health") {
        // 4. 健康检查端点
        return new Response(JSON.stringify({
            status: "healthy",
            timestamp: new Date().toISOString()
        }), { headers: { "Content-Type": "application/json" } });
    }

    // 如果所有路由规则都不匹配，返回 404 Not Found
    return new Response("Not Found", { status: 404 });
}

// --- 启动服务器 ---
console.log("正在启动 OpenAI 兼容 API 服务器...");
console.log(`服务器将在 http://localhost:8000 上运行`);
console.log(`模型列表端点: http://localhost:8000/v1/models`); // 打印出模型列表端点地址
console.log(`聊天补全端点: http://localhost:8000/v1/chat/completions`);
console.log(`本服务的 API 密钥 (前5位): ${VALID_API_KEY.substring(0, 5)}...`); // 为安全起见，不打印完整密钥

// Deno.serve 启动一个 HTTP 服务器，监听指定端口，并使用 handler 函数处理所有传入的请求。
Deno.serve({ port: 8000 }, handler);
