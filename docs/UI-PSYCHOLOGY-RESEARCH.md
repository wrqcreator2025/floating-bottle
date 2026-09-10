# 心理学与交互研究：低压力的经历连接

日期：2026-09-07。对应 `landing-experiment-03.html`。这是研究支持下的设计假设，不是被证实的「最让所有人放松」的 UI。

## 研究发现及设计应用

### 1. 可预测的操作，降低理解负担

NN/g 的表单设计分析建议减少猜测、明确下一步，将必要信息放在相关步骤。渐进披露让初始界面聚焦常用或当前所需功能。

本版应用：一次一个问题；输入后按钮写「下一步」；旁边说明「下一步选想找谁，现在不会发送」。详情折叠，输入示例短而可选。此处来自可用性指导，不是本产品的心理学实验结果。

- [Few Guesses, More Success: 4 Principles to Reduce Cognitive Load in Forms](https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/)
- [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)

### 2. 信任来自明确边界，不靠安全感装饰

Brandimarte、Acquisti 与 Loewenstein 的研究显示，对信息披露的控制感可能让人分享更多，甚至超过实际隐私保障。这不意味着要通过控制感增加披露，而是提醒：感到安心与实际安全必须区分。

本版应用：不索取姓名、学校、公司；不添加「绝对匿名」「完全安全」承诺；说明内容在何时、给谁看，以及文字内主动透露的信息仍可暴露身份。输入仅驻留页面，不保存、不上传，弹窗明确为预览。不用假头像、在线人数或虚构回应制造信任。

- [Misplaced Confidences: Privacy and the Control Paradox（论文）](https://www.cmu.edu/dietrich/sds/docs/loewenstein/MisplacedConfidence.pdf)

### 3. 愿意交流，不能简化成多问问题

Huang 等人 2017 年研究将提问、特别是追问，与感知回应性及喜欢程度联系起来。后续针对双人互动的数据再分析指出，效应与具体模型、互动环境有关，不能简单套用到落地页。

本版应用属于推论：使用一个与用户当前处境有关、容易开口的问题，保留真人的一次追问；不通过连续盘问或 AI 模拟倾听提高披露。研究并未证明此页面会提升社交意愿。

- [It Doesn’t Hurt to Ask: Question-Asking Increases Liking（论文）](https://www.hbs.edu/ris/Publication%20Files/Huang%20et%20al%202017_6945bc5e-3b3e-4c0a-addd-254c9e603c60.pdf)
- [Question Asking as a Dyadic Behavior（再分析）](https://pmc.ncbi.nlm.nih.gov/articles/PMC6857721/)

### 4. 配色是待验证选择，不是心理学处方

Elliot 的综述强调色彩效果与情境、亮度、饱和度及实验方法相关，不能宣称某色普遍促进放松或信任。

本版采用灰绿背景、暖白输入卡、深绿按钮，是降低视觉刺激、拉开文字层级的设计判断。正文保持足够深，不以低对比度换取柔和。不添加强动画、倒计时、竞争或成就暗示。

- [Color and psychological functioning: a review of theoretical and empirical work](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00368/full)

## 本次 UI

核心体验：「不用想清楚，才开始说」。首屏一个情境问题、三个可选起点、一个下一步按钮。三条轻量预期说明真人回信、一次交流、无需持续在线。分享经历为次级入口，不要求先付出才能求助。

桌面输入卡居中，手机左对齐、全宽按钮；保留键盘焦点、原生弹窗、关闭后继续修改、减少动态效果偏好。独立文件保留其他方案，所有功能仍为本地原型。

## 用户验证计划（尚未执行）

邀请真实目标用户对比第 02 与第 03 版，交替呈现顺序，使用相同任务。

1. 展示 5 秒后问：这是做什么的，下一步会发生什么？
2. 观察首次点击位置、开始输入前的停顿、完成目标经历确认的情况。
3. 询问是否感到被催促、是否清楚谁能看到内容、是否愿意发出请求；避免要求敏感真实经历。
4. 记录用户误以为「已经发送」「AI 会直接回答」的情况，优先修正这些误解。
5. 以理解与自愿行动改善作为目标，不以诱导更多私人披露作为成功。

小样本用于发现问题，不宣称具有统计显著性。最终社交价值仍需真实过来人接住率和双方反馈验证。
