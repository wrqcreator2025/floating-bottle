# 《漂流瓶》接口文档 v0.1

> 状态：前后端联调草案  
> 依据：`docs/PRD.md`、`PRODUCT_CONSTRAINTS.md` 与已确认的海岛漂流瓶前端流程。  
> 范围：定义业务 API 和联调契约，不规定后端语言、框架或数据库。

## 1. 设计原则

1. API 使用 JSON over HTTPS，前缀统一为 `/api/v1`。
2. 前端可以连续新建多个瓶子，每个瓶子独立保存；同一用户同时只有一个瓶子可主动寻找过来人。
3. 「我走过的经历」是长期个人资料，与某个瓶子、邀请或对话的生命周期分离。
4. 「接收瓶子」是查看一条精准邀请；「瓶子柜」只保存已发出和已接住的记录，不代替接收动作。
5. 接收者放行后，当前邀请结束，原瓶子继续寻找下一位符合条件且开放接收的用户。
6. AI 根据发送者的问题和可用的知乎活动信息推测其需要哪类经历，再结合接收者本人填写的经历与其知乎活动信息完成匹配。AI 不代替真人回信，不自动确认用户经历。
7. 请求只做必要校验：登录态、资源归属、必填字段、类型/枚举、合理长度和当前状态。不在 Controller、Service 和 DAO 重复做同一组校验。

同一个瓶子允许同时投递给多位符合条件的人，分别接住并回信。每人对应独立 Invitation 和 Connection；一个人接住、放行或结束对话，不影响其他人。唯一主动寻找名额限制的是瓶子数量，不是接收人数。

## 2. 通用约定

### 2.1 认证

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Token 由登录或知乎宿主环境提供。业务接口不接收客户端传入的 `userId`，用户身份从 Token 取得。

### 2.2 时间、ID 与分页

- ID 为不透明字符串，前端不解析其含义。
- 时间使用 ISO 8601 UTC，例如 `2026-09-09T04:30:00Z`。
- 列表使用游标分页：`limit` 默认 20，最大 50；返回 `nextCursor`。

### 2.3 成功响应

单个资源直接放在 `data`：

```json
{
  "data": {
    "id": "btl_01J...",
    "status": "draft"
  }
}
```

列表响应：

```json
{
  "data": [],
  "nextCursor": null
}
```

### 2.4 错误响应

```json
{
  "error": {
    "code": "ACTIVE_BOTTLE_EXISTS",
    "message": "已有一个瓶子正在寻找过来人",
    "details": {
      "activeBottleId": "btl_01J..."
    }
  }
}
```

| HTTP | 使用场景 |
| --- | --- |
| `400` | JSON 格式或必填字段错误 |
| `401` | 未登录或 Token 失效 |
| `403` | 资源不属于当前用户 |
| `404` | 资源不存在 |
| `409` | 业务状态冲突，如已有主动寻找中的瓶子 |
| `422` | 内容不适合进入经历匹配 |
| `429` | 请求过于频繁 |
| `500` | 服务端未预期错误 |
| `503` | 必需的外部能力暂时不可用 |

### 2.5 异步响应

需要后台处理的接口返回 `202 Accepted` 和可查询的业务资源 ID。前端只查询 Bottle、经验建议任务或 SliceDraft 的状态，不接触内部 outbox。后台技术故障使用 `search_error` 或对应业务任务的 `failed` 状态；`match_failed` 只表示业务上没有匹配成功。

## 3. 核心数据对象

### 3.1 Bottle（求助瓶子）

```json
{
  "id": "btl_01J...",
  "ownerRole": "sender",
  "episode": {
    "rawText": "第一次找实习，总觉得自己没准备好",
    "title": "第一次实习求职",
    "confirmed": true
  },
  "target": {
    "hintText": "想听找实习受挫后继续尝试的人说说",
    "requiredExperiences": ["有实习求职受挫经历"],
    "preferredExperiences": ["后来继续投递"],
    "viewpointPreferences": []
  },
  "status": "searching",
  "contentVersion": 1,
  "searchRound": 1,
  "createdAt": "2026-09-09T04:30:00Z",
  "launchedAt": "2026-09-09T04:35:00Z"
}
```

`status` 取值：

- `draft`：未抛出，可编辑。
- `searching`：正在匹配，占用唯一主动寻找名额。
- `paused`：暂停新增投递；已送达邀请和已建立连接仍可处理。
- `completed`：投递已结束、无待处理邀请，且至少一人曾接住。
- `match_failed`：投递已结束、无待处理邀请，且无人接住。
- `search_error`：后台匹配连续失败，等待用户重试；不表示没人愿意接住。

瓶子状态只描述寻找进度。回信、追问和封存属于各个 Connection；`completed` 不代表所有对话结束。首次接住不结束寻找、不释放名额；暂停或进入 `completed/match_failed/search_error` 时释放。已达到投递上限但还有待处理邀请时仍为 `searching`。

### 3.2 Experience（我走过的经历）

```json
{
  "id": "exp_01J...",
  "title": "第一次实习求职",
  "body": "投递过程中受挫，后来通过整理项目继续尝试。",
  "confirmedByUser": true,
  "receiveOpen": true,
  "disclosure": {
    "summary": true,
    "timeRange": false,
    "domain": true
  },
  "source": "manual",
  "updatedAt": "2026-09-09T04:30:00Z"
}
```

### 3.3 Invitation（接收邀请）

```json
{
  "id": "inv_01J...",
  "bottleId": "btl_01J...",
  "matchedExperienceId": "exp_01J...",
  "reason": "对方想听亲历过第一次实习求职受挫的人说说",
  "letter": {
    "episodeTitle": "第一次实习求职",
    "body": "最近开始准备第一份实习……",
    "wantedExperience": "经历过求职受挫，后来继尝试的人"
  },
  "status": "pending",
  "expiresAt": "2026-09-12T04:30:00Z"
}
```

`status` 取值：`pending | accepted | declined_not_now | declined_not_mine | expired`。邀请创建后默认 72 小时过期，服务端时间为准。拒绝和过期状态不进入接收者的瓶子柜。

### 3.4 Connection（一次短连接）

```json
{
  "id": "con_01J...",
  "bottleId": "btl_01J...",
  "invitationId": "inv_01J...",
  "status": "awaiting_first_reply",
  "followUpUsed": false,
  "messages": [],
  "createdAt": "2026-09-09T04:40:00Z"
}
```

`status` 取值：`awaiting_first_reply | awaiting_follow_up | awaiting_second_reply | closed`。

同一瓶子可有多个 Connection，每个接收者至多一个。一次追问额度、反馈、未读及封存均按 Connection 独立计算。发送者能查看自己的全部连接，接收者只能查看自己参与的连接，不能查看其他接收者及其回信。

首版不为 `awaiting_first_reply` 设置自动过期时间；接住者可稍后回信，任一方仍可主动关闭。后续如增加时限，必须新增明确的关闭原因和通知，不能静默删除连接。

## 4. 首页与初始数据

### `GET /api/v1/home`

一次返回首页所需的轻量状态，避免首屏多次串行请求。

```json
{
  "data": {
    "activeBottle": null,
    "pendingInvitationCount": 1,
    "unreadReplyCount": 0,
    "cabinet": {
      "sentCount": 2,
      "receivedCount": 1
    },
    "experienceCount": 3
  }
}
```

## 5. 创建与抛出瓶子

### `POST /api/v1/bottles`

新建一个独立草稿。可反复调用，不会覆盖旧瓶子。

```json
{
  "episodeText": "第一次找实习，总觉得自己还不够格",
  "targetHint": "如果可以，想听经历过求职受挫的人说说"
}
```

`targetHint` 可省略，AI 会结合问题和知乎活动信息提出需要的经历。返回 `201` 和 `Bottle`，初始状态为 `draft`。

### `PATCH /api/v1/bottles/{bottleId}`

只允许更新 `draft`。每次修改用户原文或匹配条件后，服务端递增 `contentVersion`；只发送变化的字段。

```json
{
  "sourceContentVersion": 1,
  "episode": {
    "title": "第一次实习求职",
    "confirmed": true
  },
  "target": {
    "requiredExperiences": ["有实习求职受挫经历"],
    "preferredExperiences": ["后来继续投递"]
  }
}
```

应用 AI 整理结果时必须携带生成该结果的 `sourceContentVersion`。若瓶子原文已经变化，返回 `409 STALE_AI_DRAFT`，避免把旧整理结果覆盖到新内容；用户直接手动修改时不传该字段。

### `POST /api/v1/bottles/{bottleId}/launch`

确认并抛出瓶子，开始异步匹配。请求体为空。

成功返回：

```json
{
  "data": {
    "bottleId": "btl_01J...",
    "status": "searching",
    "interaction": "throw_to_sea"
  }
}
```

若已有其他主动寻找中的瓶子，返回 `409 ACTIVE_BOTTLE_EXISTS`。草稿仍保留，不自动删除或覆盖。因网络重试而对已经 searching 的同一瓶重复调用时，返回当前成功结果，不重复创建匹配任务。

### `POST /api/v1/bottles/{bottleId}/pause`

暂停新增投递并释放主动寻找名额。已送达且未过期的邀请仍可接住、放行；已有连接照常回信。返回 `200` 和更新后的 Bottle；重复暂停返回当前 paused 结果。

### `POST /api/v1/bottles/{bottleId}/resume`

仅将 `paused` 恢复为 `searching`，保留已尝试人数和接收者记录，不重新投递给同一人。若名额被另一个瓶子占用，返回 `409 ACTIVE_BOTTLE_EXISTS`。返回 `200` 和更新后的 Bottle；因网络重试而对已 searching 的同一瓶重复调用时返回当前结果，不重复创建任务。

### `POST /api/v1/bottles/{bottleId}/retry`

重新寻找，仅允许 `match_failed` 或 `search_error` 状态调用。技术失败可发送空对象；业务失败可同时提交修改后的目标条件：

```json
{
  "target": {
    "requiredExperiences": ["经历过第一次实习受挫"],
    "preferredExperiences": []
  }
}
```

成功后 `searchRound` 加一、当前轮 `attemptedCount` 归零，瓶子进入 `searching` 并重新占用主动名额。历史邀请和连接保留，不再次投递给相同用户。若另一瓶正在寻找，返回 `409 ACTIVE_BOTTLE_EXISTS`；状态不允许时返回 `409 INVALID_BOTTLE_STATE`。

retry 成功后对已进入 searching 的同一瓶重复调用，返回当前结果，不再次增加 `searchRound` 或创建任务。

### `GET /api/v1/bottles/{bottleId}`

仅发送者可查看，返回 `data: { bottle: Bottle, connections: ConnectionSummary[] }`。摘要字段为 `id`、`status`、`unread`、`updatedAt`，不包含消息全文。连接数量受单瓶投递上限约束。接收者通过自己的邀请或连接读取信件。

## 6. AI 整理与目标经历

### `POST /api/v1/ai/episode-drafts`

读取 Bottle 中用户写下的问题，将其整理为可修改的标题和摘要。

```json
{
  "bottleId": "btl_01J...",
  "contentVersion": 1
}
```

```json
{
  "data": {
    "bottleId": "btl_01J...",
    "sourceContentVersion": 1,
    "title": "大二开始认真考虑从技术转向产品",
    "summary": "正在技术与产品方向之间做选择",
    "needsClarification": false,
    "question": null
  }
}
```

### `POST /api/v1/ai/target-drafts`

服务端根据 Bottle 中的问题、可选目标提示和当前用户可用的知乎活动画像，推测其需要哪类经历的人，并拆成必须经历、优先经历和观点偏好。返回结果必须由用户确认后才可 launch。

```json
{
  "bottleId": "btl_01J...",
  "contentVersion": 1
}
```

```json
{
  "data": {
    "bottleId": "btl_01J...",
    "sourceContentVersion": 1,
    "requiredExperiences": ["本科阶段从技术转向产品"],
    "preferredExperiences": ["有 AI 产品实习经历"],
    "viewpointPreferences": [],
    "activityUsed": true,
    "activityStatus": "fresh",
    "needsClarification": false,
    "question": null
  }
}
```

两个接口均只生成建议，不直接修改 Bottle。前端确认时通过 `PATCH /bottles/{bottleId}` 写回，并携带 `sourceContentVersion`。

问题和目标提示由服务端按 `bottleId` 读取，避免客户端同时传入两份内容。`activityStatus` 取值为 `fresh | stale | unavailable`：有缓存时允许使用最近一次活动画像；没有可用活动时仍根据问题生成建议，并返回 `activityUsed=false`，不阻塞用户抛出瓶子。接口不会把原始关注列表、关注内容流或他人内容直接返回前端。

### 高风险或普通知识问题

不适合进入经历匹配时，两个 AI 接口均可返回 `422`：

```json
{
  "error": {
    "code": "NOT_EXPERIENCE_MATCHING",
    "message": "这更像一个通用知识问题",
    "details": {
      "suggestedRoute": "search"
    }
  }
}
```

`suggestedRoute` 可为 `search | public_qa | professional_help | crisis_help`。不返回 AI 伪造的「过来人回答」。

## 7. 接收瓶子与放行

### `GET /api/v1/invitations/next`

用户点击「接收一个瓶子」时调用。只返回一条待处理邀请，不返回候选人或公共求助列表。

有来信时返回 `200` 和 `Invitation`；暂时没有时返回 `204 No Content`。

该读取不会占用或改变邀请状态。若邀请在用户阅读期间过期，提交 decision 时返回 `409 INVITATION_EXPIRED`，前端播放回海动画并提示该瓶已继续漂流。

前端动画顺序：瓶子从远海出现 → 用户拾起 → 拖动开塞 → 展开信纸。

### `POST /api/v1/invitations/{invitationId}/decision`

```json
{
  "decision": "accept"
}
```

`decision` 取值：

- `accept`：接住，创建短连接，进入回信。
- `not_now`：演过，但这次不聊。
- `not_mine`：这一集没演过。

接住响应：

```json
{
  "data": {
    "invitationId": "inv_01J...",
    "status": "accepted",
    "connectionId": "con_01J...",
    "interaction": "open_reply_editor"
  }
}
```

放行响应：

```json
{
  "data": {
    "invitationId": "inv_01J...",
    "status": "declined_not_now",
    "interaction": "return_to_sea",
    "bottleContinuesMatching": true
  }
}
```

前端收到 `return_to_sea` 后播放「信纸装回瓶中 → 落塞 → 抛回海面 → 一次涟漪」。放行不生成瓶子柜记录，不降低信用、积分或后续匹配权重。

`bottleContinuesMatching` 按实际结果返回：瓶子仍为 `searching` 时为 true，暂停或寻找结束时为 false；回海动画始终保留。接住只创建当前接收者的连接，不撤销其他邀请。

决策操作按邀请幂等：重复提交相同 decision 返回当前结果；提交不同 decision 返回 `409 INVITATION_ALREADY_DECIDED`。是否过期与状态转换由同一个条件更新决定，不先查询再更新。

## 8. 回信、追问与封存

### `GET /api/v1/connections/{connectionId}`

返回本次连接、双方允许披露的相关经历和消息。不返回姓名、头像、学校、公司、粉丝数或知乎主页。

### `POST /api/v1/connections/{connectionId}/messages`

发送首封回信、唯一一次追问或追问回应。消息角色和当前状态由服务端判定，前端不传 `senderId`或自行指定消息类型。

```json
{
  "body": "当时我也很怕投递。后来我先整理了两个小项目……"
}
```

```json
{
  "data": {
    "message": {
      "id": "msg_01J...",
      "body": "当时我也很怕投递……",
      "createdAt": "2026-09-09T05:00:00Z"
    },
    "connectionStatus": "awaiting_follow_up",
    "interaction": "return_to_sea"
  }
}
```

首封回信发送成功后，接收者看到装瓶并抛回海面的动画；发送者的瓶子柜产生未读回信。

### `POST /api/v1/connections/{connectionId}/close`

任一方主动结束当前连接，或在该连接的一次追问往返完成后封存。其他接收者的连接及瓶子寻找状态不受影响。不创建好友关系，不开启无限私聊。

成功返回：

```json
{
  "data": {
    "connectionId": "con_01J...",
    "status": "closed",
    "closedAt": "2026-09-09T06:00:00Z"
  }
}
```

重复关闭返回相同结果；已关闭连接继续发送消息返回 `409 CONNECTION_CLOSED`。

### `POST /api/v1/connections/{connectionId}/feedback`

```json
{
  "result": "felt_understood"
}
```

`result` 取值：

- `felt_understood`：TA 确实接住了我。
- `similar_but_missed`：经历相似，但没有真正回应到处境。
- `wrong_experience`：TA 不是我想找的过来人。

反馈仅允许发送者在收到首封回信后提交，每个 Connection 一次。成功返回 `200` 和 `{ "data": { "connectionId": "con_01J...", "result": "felt_understood" } }`；重复提交相同结果返回当前记录，修改结果返回 `409 FEEDBACK_ALREADY_SUBMITTED`。

## 9. 瓶子柜

### `GET /api/v1/cabinet`

查询参数：

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `direction` | `sent | received` | 必填，切换「已发出 / 已接收」 |
| `cursor` | string | 可选，分页游标 |
| `limit` | 1–50 | 可选，默认 20 |

```json
{
  "data": [
    {
      "id": "cab_01J...",
      "direction": "received",
      "bottleId": "btl_01J...",
      "connectionId": "con_01J...",
      "title": "第一次实习求职",
      "preview": "最近开始准备第一份实习……",
      "bottleStatus": "searching",
      "connectionStatus": "awaiting_follow_up",
      "unread": false,
      "updatedAt": "2026-09-09T05:00:00Z"
    }
  ],
  "nextCursor": null
}
```

瓶子柜只是已有记录的投影，不在该接口中执行匹配或接收邀请。

`sent` 每个已抛出的瓶子一条记录，`connectionId/connectionStatus` 为 null，`unread` 汇总该瓶子所有连接；详情展示各个连接供分别打开。`received` 每个当前用户参与的连接一条记录，只显示该连接的未读和状态。草稿不计入已发出，首页柜子计数遵循同一口径。

### `GET /api/v1/cabinet/{recordId}`

返回用户可见的瓶子、相关连接及消息摘要。已发出详情列出全部连接摘要，已接收详情仅返回当前用户参与的连接。读取柜子不批量清除该瓶子其他连接的未读；实际打开某段回信后，通过 `POST /notifications/{notificationId}/read` 标记对应通知已读。

## 10. 我走过的经历

### `GET /api/v1/experiences`

返回当前用户所有已确认经历，包括已关闭接收的经历。

### `POST /api/v1/experiences`

```json
{
  "title": "第一次实习求职",
  "body": "投递过程中受挫，后来通过整理项目继续尝试。",
  "confirmedByUser": true,
  "receiveOpen": true,
  "disclosure": {
    "summary": true,
    "timeRange": false,
    "domain": true
  }
}
```

`confirmedByUser` 必须为 `true`。不要求 offer、毕业证、工作证明或其他证明材料。

成功返回 `201` 和 Experience。

### `PATCH /api/v1/experiences/{experienceId}`

修改文字、披露范围或接收开关。关闭 `receiveOpen` 只影响未来匹配，不删除已有瓶子和连接。

```json
{
  "receiveOpen": false
}
```

成功返回 `200` 和更新后的 Experience。

### `DELETE /api/v1/experiences/{experienceId}`

删除前返回冲突提示的职责属于前端；接口在用户明确确认后调用。已建立连接保留必要的当时快照，但不再用于新匹配。

成功返回 `204 No Content`。重复删除返回 `404`；只检查资源归属和已有连接所需快照，不增加额外确认字段。

### `POST /api/v1/ai/experience-suggestions`

在用户主动触发且平台允许的范围内，使用“知乎搜索”检索公开表达并生成「可能走过的经历」草稿。搜索结果中的作者信息必须能可靠限定为当前用户；若官方接口不支持该限定，则不执行个人经历发现，也不根据同名作者猜测身份。

该接口不使用知乎直答 Agent 生成经历或回答。建议只作为草稿返回，不直接进入匹配池；用户修改、确认后再调用 `POST /experiences`。

```json
{
  "query": "转专业 产品实习"
}
```

`query` 为用户主动提供的检索词。成功创建后台任务时返回 `202`：

```json
{
  "data": {
    "jobId": "job_01J...",
    "status": "processing"
  }
}
```

### `GET /api/v1/ai/experience-suggestions/{jobId}`

查询任务状态。完成后返回至多 5 条建议及其公开内容依据：

```json
{
  "data": {
    "status": "completed",
    "suggestions": [
      {
        "title": "从开发转向产品实习",
        "body": "根据公开表达整理出的可编辑草稿",
        "sources": [
          {
            "contentId": "zh_...",
            "title": "公开内容标题",
            "excerpt": "用于本人确认的短摘要"
          }
        ]
      }
    ]
  }
}
```

可能状态为 `processing | completed | failed`。达到知乎搜索配额返回 `429 ZHIHU_SEARCH_DAILY_LIMIT`；无法可靠限定当前用户的公开表达时返回 `503 ZHIHU_AUTHOR_FILTER_UNAVAILABLE`。任务重试不创建第二个任务，前端可继续查询原 `jobId`。

## 11. 寻找状态和匹配失败

### `GET /api/v1/bottles/{bottleId}/search-status`

```json
{
  "data": {
    "status": "searching",
    "attemptedCount": 2,
    "attemptLimit": 5,
    "message": "还在寻找同时符合经历且愿意接住的人",
    "updatedAt": "2026-09-09T05:00:00Z"
  }
}
```

不返回候选者列表、学校、公司或排名。失败时 `status` 为 `match_failed`，并返回可用动作：

```json
{
  "data": {
    "status": "match_failed",
    "reason": "all_declined_or_expired",
    "availableActions": ["retry", "edit_and_retry"]
  }
}
```

`reason` 取值为 `no_candidates | all_declined_or_expired`。后台任务在最大重试次数后仍无法执行时，状态改为 `search_error`，返回 `availableActions: ["retry"]`；该状态表示系统暂时失败，不表示无人愿意接住。两种状态都通过 `POST /bottles/{id}/retry` 恢复。不得在失败后使用 AI 生成一封伪冒真人的回信。

单瓶累计向 3–5 位不同接收者投递（实际总上限由服务端配置），允许这些邀请同时待处理和被接住；不因首次接住提前停止其余投递。`attemptedCount` 为已创建邀请的不同接收者人数，不是任务重试次数。达到上限或候选耗尽后停止新增投递；待全部邀请决策或过期，再按是否曾有人接住返回 `completed` 或 `match_failed`。暂停期间只处理已送达邀请，不自动恢复寻找。

## 12. 通知

### `GET /api/v1/notifications`

返回来信邀请、瓶子被接住、新回信、追问、匹配失败和系统匹配故障通知。查询参数为 `cursor`、`limit`（默认 20，最大 50）和可选的 `unreadOnly=true`。

```json
{
  "data": [
    {
      "id": "ntf_01J...",
      "type": "first_reply_received",
      "resourceType": "connection",
      "resourceId": "con_01J...",
      "title": "有人寄回了一封信",
      "createdAt": "2026-09-09T05:00:00Z",
      "readAt": null
    }
  ],
  "nextCursor": null
}
```

`type` 取值：`invitation_received | bottle_accepted | first_reply_received | follow_up_received | match_failed | search_error`。`resourceType` 取值：`invitation | bottle | connection`。同一业务事件只产生一条通知。

### `POST /api/v1/notifications/{notificationId}/read`

标记单条已读。成功返回 `200` 和更新后的 Notification；重复调用仍返回相同结果。

WebSocket/SSE 是后续可选优化。首版在页面活跃时每 20 秒轮询一次 `/home` 或 `/notifications?unreadOnly=true`，窗口重新获得焦点时立即刷新；后台页面停止轮询。

## 13. 经验切片与社区回流

### `POST /api/v1/connections/{connectionId}/slice-drafts`

连接结束后，只有在过来人主动同意时才生成脱敏草稿。

```json
{
  "consent": true
}
```

仅该 Connection 的 responder 可调用。成功创建草稿任务返回 `202`：

```json
{
  "data": {
    "id": "slc_01J...",
    "status": "generating"
  }
}
```

同一 Connection 只保留一份切片草稿。重复调用返回现有草稿；若现有状态为 `failed`，重新进入 `generating`。

### `GET /api/v1/slice-drafts/{sliceId}`

仅原作者可查询。`status` 取值为 `generating | ready | failed | published`；生成完成时返回：

```json
{
  "data": {
    "id": "slc_01J...",
    "connectionId": "con_01J...",
    "status": "ready",
    "title": "第一次实习受挫后，我做了什么",
    "body": "已经脱敏、可继续修改的经验草稿"
  }
}
```

### `PATCH /api/v1/slice-drafts/{sliceId}`

原作者修改 AI 整理后的标题和正文。请求只允许 `title`、`body`，仅 `ready` 状态可修改；成功返回 `200` 和更新后的切片。

```json
{
  "title": "第一次实习受挫后，我做了什么",
  "body": "由原作者确认并修改后的经验正文"
}
```

### `POST /api/v1/slice-drafts/{sliceId}/publish`

原作者最终确认后才进入公共经验池。仅 `ready` 状态可发布，成功返回 `200` 和 `{ "data": { "id": "slc_01J...", "status": "published" } }`；重复发布返回相同结果。该操作不公开原始私人对话。

## 14. 知乎开放接口选型

本项目只接入与“按真实经历连接人”直接相关的能力。官方接口的实际路径、鉴权参数和返回字段以接入时提供的规范为准，本 API 不透传官方原始响应。

| 知乎能力 | 是否调用 | 本项目用途 |
| --- | --- | --- |
| v3 知乎关注流 | 接入 | 获取当前用户的关注关系与关注内容流，形成兴趣、阶段和关注方向的辅助画像；不把关注数量当作匹配权重 |
| v4 知乎搜索 | 接入 | 提取参与者公开创作中的经历语义，辅助推测发送者需要的经历并对已开放接收的候选人排序；也用于经历建议和经验切片关联 |
| v1 知乎热榜 | 不调用 | 实时热点与经历匹配主流程无关，且每日 100 次额度不值得消耗 |
| v2 知乎故事 | 不调用 | 虚构故事和改编能力不用于真实经历匹配 |
| v5 全网搜索 | 不调用 | 第一阶段只需要知乎公开内容，不扩大全网画像和检索范围 |
| v6 知乎知识 | 不调用 | 当前没有与核心流程直接对应的知识展示或讨论模块 |
| v7 直答 Agent | 不调用 | 产品依赖真人回信，也不提供普通知识问答；不得用直答结果冒充过来人 |

匹配时，发送者的问题和活动画像用于形成目标经历；接收者本人已确认且打开接收的 Experience 决定其是否进入候选池，接收者活动画像用于补充语义和排序。活动信息不能单独证明某人经历过某事，也不能绕过 `receiveOpen=false`。任何一方的关注列表、关注流原文、搜索记录和原始活动内容都不向另一方返回。

v3 当前只使用官方明确提供的关注列表、关注关系和关注内容流；v4 当前只使用官方返回的公开文章与问答信息。没有明确开放的浏览历史、点赞历史、收藏或私密行为不纳入设计。

### `GET /api/v1/integrations/zhihu/status`

返回当前用户的知乎活动能力、画像新鲜度，以及本应用记录的搜索调用量：

```json
{
  "data": {
    "activityProfileAvailable": true,
    "activitySources": ["follow_feed", "public_content"],
    "lastActivitySyncAt": "2026-09-09T03:00:00Z",
    "followFeedAvailable": true,
    "searchAvailable": true,
    "effectiveDailyLimit": 5000,
    "usedToday": 12,
    "resetsAt": "2026-09-10T00:00:00+08:00"
  }
}
```

`effectiveDailyLimit` 是知乎搜索官方 5000 次上限和应用配置预算中的较小值。缓存命中不计入 `usedToday`。达到上限时使用已有活动画像；没有画像时退化为“发送者问题 + 接收者已确认经历”完成匹配。知乎接口不可用不阻塞瓶子创建、匹配、接收和真人回信。

用户给出的能力描述没有包含独立 OAuth 接口，因此不在本版虚构 `/authorize` 或撤销授权接口。登录和调用凭据由知乎宿主环境提供；若后续获得正式授权协议，再补充相应契约。

## 15. 最小校验规则

以下校验足以支撑首版，不再增加大量形式化规则：

| 字段 | 规则 |
| --- | --- |
| 瓶子问题 | trim 后非空，最大 4000 字符 |
| 目标提示 | 可省略；提供时 trim 后非空，最大 4000 字符 |
| 回信、追问 | trim 后非空，最大 8000 字符 |
| 经历标题 | trim 后非空，最大 80 字符 |
| 经历正文 | trim 后非空，最大 8000 字符 |
| 经历确认 | 创建时 `confirmedByUser === true` |
| 枚举值 | 必须属于文档声明的取值 |
| 资源操作 | 资源属于当前用户，且处于允许的状态 |

语义判断（是否真是经历问题、经历/观点条件拆分、高风险内容识别）集中在内容理解层，不在每个业务接口重复运行。数据库用唯一索引、外键和状态条件更新保证并发一致性，不额外堆叠多层手写检查。

launch 前必须已有用户确认的 `requiredExperiences`；该条件来自 AI 建议、用户修改或两者结合，不要求创建草稿时先写出完整目标。

## 16. 联调顺序

1. `GET /home`、瓶子 CRUD、抛出与瓶子柜。
2. `GET /invitations/next`、接住/放行、首封回信和回海动画状态。
3. 我走过的经历 CRUD、开放接收和披露范围。
4. AI 处境整理、目标经历拆分和异步匹配。
5. 一次追问、反馈、经验切片、通知与知乎搜索集成。

## 17. 前端动画与 API 状态对应

| 用户动作 | API | 成功后前端反馈 |
| --- | --- | --- |
| 抛出新瓶子 | `POST /bottles/{id}/launch` | 装信、落塞、抛向远海、一次涟漪 |
| 接收一个瓶子 | `GET /invitations/next` | 远海出现瓶子，拾起后可拖动开塞 |
| 接住来信 | `POST /invitations/{id}/decision` | 进入回信编辑，接收记录进入柜子 |
| 写完回信 | `POST /connections/{id}/messages` | 回信装瓶并抛回海面 |
| 这次不聊 / 没演过 | `POST /invitations/{id}/decision` | 原信装回瓶中并抛回海面，不进柜子 |
| 打开瓶子柜 | `GET /cabinet` | 只展示已发出和已接住记录 |
| 修改我的经历 | `PATCH /experiences/{id}` | 日记页显示已保存，不改变瓶子数据 |
