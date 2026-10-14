# MES Companion Web

手机优先的 MES 交易纪律副屏。它只提供时间、提醒和手动记录，不连接交易账户、不发送订单，也不提供交易信号。

## 功能

- 纽约与本地双时钟，自动处理 EST / EDT
- 1、3、5、15 分钟 K 线倒计时与 Bar 编号
- 交易窗口、收尾、锁定及 CME 节假日提示
- 手机总览、全屏极简副屏和交易日志
- 持仓计时、5 笔上限、-2R 停止规则及冷静期
- 浏览器本地保存、JSON 导入导出
- PWA 安装及离线缓存
- 每日自动抓取 BLS、BEA 官方经济事件日历
- CPI、非农、PPI、JOLTS、GDP、PCE、FOMC 等事件倒计时

## 使用

线上版本：<https://stock2lab.github.io/mes-companion-web/>

项目是零依赖静态网页，也可以直接用任意静态文件服务器打开：

```powershell
python -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

## 数据和日历

交易记录仅保存在当前浏览器。清除浏览器数据、换浏览器或换设备前，请先在设置页导出 JSON 备份。

项目预置 2026–2027 节假日规则。CME 可能临近日期调整假日交易时间，使用前应以 CME 官方安排为准。

## 经济事件更新

`.github/workflows/pages.yml` 每天运行 `scripts/fetch-events.mjs`，从 BLS 官方 ICS 和 BEA 官方发布计划生成 `data/events.json`，然后在同一个工作流中重新部署 Pages。BLS 会阻止部分自动客户端，因此 `data/manual-events.json` 同时保存按其官方日历核验的后备事件；FOMC 事件也在该文件中人工核验。生成结果会如实记录每个来源的状态。整个流程不使用 AI，也不需要 API 密钥。

## 相关项目

ESP32 固件版本：[mes-trading-session-assistant](https://github.com/stock2lab/mes-trading-session-assistant)

