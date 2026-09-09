---
name: hedgehog-daily-morning-briefing
description: >
    Pre-market intelligence brief. Filters macro, sector and watchlist news to extract core logic.
    Best for: high signal-to-noise pre-market briefing.
    Triggers: morning brief, financial breakfast, daily summary.
    Blocking: deep stock fundamentals, live order book data.
version: 2.2.9
workflow_based: true
---

# 每日早报（今日早报/财经早报）

开盘前提炼宏观、产业与自选股情报。客观简洁，点明事件及可能影响，不展开深度基本面分析。

## 数据与执行约束

- 资讯使用 `hedgehog-news-reports`；股票信息、行情、资金流向和交易日历使用 `hedgehog-company-index-data`；自选股取自用户指定或 `hog-gateway-tools` 的 `get_watchlist`。
- 按实际数据输出，缺失标注“无”或“数据不足”，不得编造或扩大股票、行业范围凑数。自选股为空时跳过相关查询，雷达整章标注“暂无自选股数据”。
- 遵守 `Sub-agent 调度与验收纪律` 和 `Token Efficiency Discipline`，每批最多 3 个 Sub-agent，文件统一保存在任务目录，不建子目录。
- 原始数据通过 `call_api.js --out <语义化文件名>` 直接落盘；Sub-agent 将文件名及 `[DataSaved]` 返回的行数、字节数追加至 `data-index.md`，无需重命名或重复统计。索引格式：

```text
## Sub-agent-[index]:
- {file-name}: {行数:<N>;字节:<B>}
```

- 每个 Sub-agent 读取原始数据，按输出模板提取所负责内容，保存为 `output-sub-<short_title>.md`（800 tokens 以内）；摘要须自足，保留数据口径、日程日期/时间和真实引用 `{资讯分类:id} 标题`（如有原文 URL 一并保留）。引用编号仅供内部追溯，终稿按下方规则转换为标题链接。
- `sub-agent-list.txt` 是系统内部运行记录，不属于交付物；无需创建、读取或校验，缺失不影响验收，也不列为未交付成果。主 Agent 无需读写 `data-index.md`。

## 工作流

### 1. 准备（主 Agent）

确认自选股 `stock_code`，通过 `querySwIndustryMember(stock_code=[代码])` 获取申万一级行业 `l1_name`，按频次取最多 3 个重点行业。

以 `Asia/Shanghai` 为时区，通过交易日历确定前一交易日，生成查询参数：

| 参数 | 取值 |
| --- | --- |
| `news_announcement_start` | 前一交易日 08:00:00，用于快讯、新闻、公告 |
| `research_start_date` | 前一交易日，`YYYY-MM-DD`，用于研报 |
| `start_date_30d` | 30 日前，`YYYY-MM-DD`，用于行情、资金流向 |

资讯查询不传 `end_date` / `end_time`，获取截至执行时已有的数据。

### 2. 收集（Sub-agent）

首批并发收集快讯与宏观/重点行业资讯，后续每只自选股分配一个 Sub-agent，按并发上限分批执行。

| 范围 | 查询 |
| --- | --- |
| 快讯 | `queryFlashNewsList(start_time=[news_announcement_start])` |
| 宏观 | `queryNewsList(start_date=[news_announcement_start], importance_score=4, news_type='macro')` |
| 各重点行业 | `queryNewsList(start_date=[news_announcement_start], importance_score=4, news_type='industry', tags=[行业])`；`queryResearchList(start_date=[research_start_date], report_type='industry', tags=[行业])` |
| 各自选股资讯 | `queryNewsList(start_date=[news_announcement_start], importance_score=3, news_type='stock', tags=[code])`；`queryResearchList(start_date=[research_start_date], importance_score=3, report_type='stock', tags=[code])`；`queryAnnouncementList(start_date=[news_announcement_start], importance_score=3, stock_code=[code])` |
| 各自选股行情 | `queryStockDaily(stock_code, start_date=[start_date_30d])`；`queryMoneyflow(stock_code, start_date=[start_date_30d])` |

从上述资讯中同步提取“今日关注”所需日程，按事件发生日期筛选。

### 3. 生成与交付（主 Agent）

等待全部 Sub-agent 完成，仅读取 `output-sub-*.md`，按下方模板生成 `final-output-morning-briefing-<YYYYMMDD>.md`；摘要缺失要素时标注数据不足，不回读原始数据。首次 `write` 写入标题，后续用 `write(append:true)` 逐节追加，修改用 `edit`。

完成 Markdown 后，读取该终稿，按下方排版要求生成同目录、同名的 `final-output-morning-briefing-<YYYYMMDD>.html`。

核对两版内容、模板结构和字数，确认正文无引用标记、尾注标题链接对应真实来源；预览 HTML 的桌面与手机布局，检查视觉层级、留白、表格与长标题，修正拥挤、溢出或文字过小后交付 Markdown、HTML、`data-index.md`。文本回复只发摘要。

## 引用与链接

- Markdown 与 HTML 的正文（含列表、表格）均不附 `{News:56563}` 等引用标记，出处统一列在文末“参考资料”。
- 只汇总正文实际采用的来源，按“资讯分类 + id”去重；隐藏编号前缀，以标题作为链接文字。Markdown 使用 `[标题](完整URL)`，HTML 使用对应的 `<a href="完整URL">标题</a>`。
- 按真实来源类型与 ID 生成绝对链接：

| 来源类型 | 链接 |
| --- | --- |
| 新闻（News） | `https://app.ciweiai.com/information/news/{id}` |
| 快讯（Flash / FlashNews） | `https://app.ciweiai.com/information/flash/{id}` |
| 研报（Research） | `https://app.ciweiai.com/information/research/{id}` |
| 公告（Announcement） | `https://app.ciweiai.com/information/announcement/{id}` |

例如 `{News:56563} 新闻标题` 转为 `[新闻标题](https://app.ciweiai.com/information/news/56563)`。其他类型使用摘要中已有的原文 URL；无法确定链接时保留纯标题，不猜测地址。

## HTML 排版

以精致、清晰的财经刊物为视觉方向，让读者先看到重点，再按层级阅读细节。

- **内容**：依据 Markdown 终稿排版，保留三个主板块及其顺序、事实、数值、标题链接和 AI 提示；每项内容只展示一次，图表须有文内数据支撑。
- **整体**：浅灰蓝页面、白色内容区、深墨色正文、单一蓝色强调。页面居中，内容宽度约 1100px，四周留白；主板块用轻边框与适度圆角，内部小节靠间距和细分隔线组织，减少嵌套卡片与大面积阴影。
- **页首与文字**：紧凑页首突出“每日早报”和日期，装饰不占据主要阅读空间。标题、小标题、正文和辅助信息层级鲜明；正文以 16px、1.7 倍行高为基准，辅助文字保持清晰对比度。段落适当分行，仅强调关键词与关键数值。
- **宏观要闻**：宽屏优先将“重要三件事”作为主栏、“关键数据”作为辅栏，内容较长时采用通栏；三件事用醒目序号、简短标题和说明组成列表。产业要闻排在其下，按行业分组，并随内容长度调整列数。
- **自选股与今日关注**：资讯摘要、异动表和风险分类依次展开；风险用浅色提示区，类别加粗。今日关注采用“时间—事项—影响”的整齐列表，时间作为视觉起点。
- **表格与数值**：保留表格结构，使用浅色表头、细行分隔和充足单元格内边距；文字左对齐、数值右对齐并用等宽数字。数值与单位相邻，保留时期和正负号。关键数据表的空列仅作视觉间隔；行内只强调最关键的值，颜色辅助表达含义。
- **移动端与尾注**：窄屏按阅读顺序改为单列，长标题自然换行；宽表仅在自身容器内横向滚动，正文不横向溢出。参考资料用紧凑的标题链接列表，AI 提示置于页底，字号稍小但清晰可读。
- **文件**：生成可独立打开的 UTF-8 HTML，内嵌 CSS，使用中文系统字体并设置 viewport；正文和样式离线可读，参考资料保留可点击的绝对链接。

## 输出模板

```markdown
【每日早报：YYYY-MM-DD】

### 1. 宏观要闻

**重要三件事**（按重要性选取 3 件宏观事件，数据不足时按实际数量）

- [事件及可能影响]

**关键数据**（从宏观新闻获取，每行最多 2 项，保留时期、单位和口径）

| 名称 | 数据 |  | 名称 | 数据 |
| --- | --- | --- | --- | --- |
| [指标/时期] | [数值及单位] |  | [指标/时期] | [数值及单位] |

**产业要闻**（各重点行业约 50 字）

- [行业]：[事件及供需或产业链影响]

### 2. 自选股雷达

**资讯摘要**：[覆盖自选股的重要资讯，200 字以内]

**前期异动**（基于行情及资金流向，最多 3 只股票，表格正文合计不超过 90 字）

| 股票 | 异动点 |
| --- | --- |
| [名称/代码] | [关键异动及数据] |

**风险排雷**：[按风险类别呈现明确的负面催化因素，格式为“类别：风险事项”，合计 100 字以内；无则写“今日暂无重大排雷事项”]

### 3. 今日关注

[列出来源明确、预计今日发生且可能较大影响大盘或个股的事件、会议、数据公布、财报公布等事项；无则写“今日暂无明确的重要关注事项”]

- [时间（北京时间，未明确则标注待定）]：[事项]；[可能影响的市场、行业或个股及关注点]

### [参考资料]

[按“引用与链接”规则汇总去重，每条显示可点击的标题，不显示引用编号]

- [资料标题](完整来源URL)

### [AI生成提示]

以上内容由AI生成，可能存在偏差，仅供参考。
[如有关键数据缺失，简要说明]
```
