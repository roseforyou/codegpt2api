# Codegpt2api for Deno Deploy

这是一个运行在 [Deno Deploy](https://dash.deno.com/) 平台上的服务，用于将 CodeGPT 的 API 接口转换为兼容 OpenAI Chat Completion API 的格式。你可以用现有的支持 OpenAI API 的工具、库或应用（比如 Cherry Stdio、ChatBox 等）来调用 CodeGPT 的能力。

## 核心功能

* 转发 OpenAI Chat Completion API 的请求至 CodeGPT API
* 将 CodeGPT 的流式或非流式响应转换为 OpenAI 格式
* 通过环境变量配置 CodeGPT 的 API Key、Agent ID 和 Organization ID
* 支持自定义客户端 API Key，保护你的服务不被滥用
* 部署简单，适用于 Deno Deploy 平台

## 为什么用这个项目？

如果你希望使用 CodeGPT 提供的模型，但又想继续使用 OpenAI 生态下熟悉的工具，那么这个服务可以作为两者之间的桥梁，方便你无缝衔接。

## 准备工作

1. 一个 CodeGPT 账户（[https://app.codegpt.co/](https://app.codegpt.co/)）
2. 一个 Deno Deploy 账户（[https://dash.deno.com/](https://dash.deno.com/)）
3. 本项目代码文件（`main.ts`）

---

## 部署教程（适合小白）

部署过程主要分为两步：获取必要的 Key 和 ID，以及配置环境变量。

### 第一步：获取 CodeGPT 所需信息

1. **登录 CodeGPT 平台：** 访问 [https://app.codegpt.co/](https://app.codegpt.co/) 并登录你的账户。

2. **获取 `CODEGPT_AGENT_ID`：**

   * 点击左侧菜单中的 [**"My Agents"**](https://app.codegpt.co/en/agents)
   * 可以选择一个已有的 Agent，也可以点击右上角的“New Agent”新建一个
   * 进入 Agent 详情页后，查看浏览器地址栏，URL 中 `/agents/` 后面那串 UUID 就是 Agent ID
   * 例如：`https://app.codegpt.co/en/agents/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/settings` 中的 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

3. **获取 `CODEGPT_API_KEY` 和 `CODEGPT_ORG_ID`：**

   * 点击左侧菜单中的 **"API Connection"**
   * 点击“Create new API Key”，随便命名，创建后系统会生成一串以 `sk-` 开头的密钥
   * 请务必复制保存好这串密钥，它只会显示一次
   * 同页面还能看到你的 Organization ID，也是一个 UUID 格式的字符串

---

### 第二步：定义你自己的客户端 Key（`VALID_API_KEY`）

这个 Key 是给你的代理服务用的，每个客户端调用服务时都需要提供它。为安全起见，这个 Key 应该与你的 `CODEGPT_API_KEY` 不一样。

建议用随机生成的复杂字符串，例如使用 Base64 编码后的随机串。比如：

```
my-secret-proxy-key-123456
```

当然越复杂越好。记住这个 Key，后面会用到。

---

### 第三步：部署到 Deno Deploy 并配置环境变量

1. 登录 [https://dash.deno.com/](https://dash.deno.com/)
2. 点击 “New Playground”
3. 将项目的 `main.ts` 内容粘贴进编辑器
4. 点击 “Save & Deploy”
5. 部署完成后，进入项目的 **Settings** 页面（网址大概是 `https://dash.deno.com/projects/xxx/settings`）
6. 找到 **Environment Variables**，依次添加以下 4 个变量：

   * `CODEGPT_AGENT_ID`
   * `CODEGPT_API_KEY`
   * `CODEGPT_ORG_ID`
   * `VALID_API_KEY`

保存后服务会自动重启并生效。

---

### 第四步：获取服务地址

部署成功后，项目页面顶部会显示一个以 `.deno.dev` 结尾的地址，比如：

```
https://your-project-name.deno.dev
```

复制这个地址，后续请求就用它作为基础。

---

## 如何使用这个服务

你的服务已经在 Deno Deploy 上跑起来了，使用方式和调用 OpenAI API 几乎一致。

### 请求地址

```
POST https://YOUR_DENO_DEPLOY_URL/v1/chat/completions
```

将 `YOUR_DENO_DEPLOY_URL` 替换为你的实际部署地址。

### 示例请求（使用 curl）：

```bash
curl -X POST \
  https://YOUR_DENO_DEPLOY_URL/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_VALID_API_KEY_HERE" \
  -d '{
    "model": "claude-4-sonnet-thinking-max", 
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, world!"}
    ],
    "stream": false
  }'
```

`model` 字段请根据你在 CodeGPT 配置的 Agent 模型填写。


