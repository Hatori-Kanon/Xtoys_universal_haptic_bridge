# XToys 通用触觉协议 v1

本文档定义游戏侧 Bridge 发送给 XToys Universal Haptic Bridge（XTHB）的消息。游戏只描述逻辑部位与期望效果；不要在游戏中写 XToys 设备、通道、Job 或设备型号名称。

## 传输封装

Webhook 的固定外层 `action` 是 `xtoys_game_bridge`。真实协议对象必须 JSON 编码后放入 `payload` 字符串；因此下列每个示例都是可直接解析的外层 JSON，内层 JSON 已正确转义。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"play\",\"source\":\"my-game\",\"eventId\":\"hit-0001\",\"sequence\":1,\"targets\":[{\"part\":\"clitoris\",\"intensity\":65,\"frequency\":40,\"durationMs\":900,\"rampUpMs\":120,\"rampDownMs\":180,\"priority\":10}]}"
}
```

不要把游戏事件名放入外层 `action`。`action` 只是 XToys Webhook 的固定路由；游戏含义由内层 `command`、`source`、`eventId` 与 `targets` 表达。

## 内层公共字段

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `protocolVersion` | number | 必须为 `1`。 |
| `command` | string | `play`、`update`、`stop`、`stop_all`、`set_baseline` 或 `test`。 |
| `source` | string | 每条消息必填、非空；一个稳定的游戏/Bridge 标识。 |
| `eventId` | string | `play`/`update` 必填；`stop` 可选。 |
| `sequence` | number | 同一有限事件的版本号；`set_baseline` 也必填。 |
| `states` | string[] | 可选诊断标签，最多 32 个；不参与输出叠加。 |
| `targets` | array | 效果目标；命令是否要求它由下文决定，最多 32 个。 |

`source + eventId` 是有限事件的身份：不同 `source` 可以使用相同的 `eventId` 而互不影响。对同一身份，`play` 或 `update` 只有严格大于当前 `sequence` 才会替换整个事件；重复或较小序号会被忽略。接受时间以 XToys 接受消息的时刻为准，有限事件在 `acceptedAt + durationMs` 到期。

基线按 `source` 单独保存。一个较新的 `set_baseline` 用该 `source` 的**完整快照**替换旧快照，遗漏的部位会被清除；其 `sequence` 也必须严格递增。`stop` 只操作同一 `source` 的事件。`stop_all` 不按 `source` 区分，会清除全部来源的基线和有限事件。

## `targets` 中的全部字段

| 字段 | 类型/默认值 | 说明 |
| --- | --- | --- |
| `part` | string，必填 | 逻辑叶子部位或配置的虚拟组。 |
| `effect` | `hold`（默认）或 `pulse` | `pulse` 根据 `pulseOnMs`/`pulseOffMs` 周期切换；`hold` 持续输出。 |
| `intensity` | number，默认 `0`，夹到 0–100 | 强度槽的期望强度。若字段完全缺失，该目标不驱动强度槽。 |
| `frequency` | number，默认 `0`，夹到 0–100 | 频率能力已开启的强度槽使用它；普通强度槽和旋转槽忽略它。 |
| `rotateSpeed` | number，可选，夹到 0–100 | 旋转槽的期望速度；不会从 `intensity` 推导。缺失时不驱动旋转槽。 |
| `rotateDirection` | `clockwise`/`counterclockwise` | `rotateSpeed > 0` 时必填；方向只能由游戏显式发送。 |
| `durationMs` | 有限事件必填且大于 0 | 有限事件总时长。基线/测试目标可省略，默认 0。 |
| `rampUpMs` | number，默认 `0` | 数值升高时的渐入时间。 |
| `rampDownMs` | number，默认 `0` | 数值降低、停止或有限事件到期时的渐出时间。 |
| `pulseOnMs` | number，默认 `0` | `pulse` 的开区间；为 0 时脉冲不会输出瞬态值。 |
| `pulseOffMs` | number，默认 `0` | `pulse` 的关区间；为 0 时始终处于开区间。 |
| `priority` | number，默认 `0` | 同一物理槽中有限事件竞争时，数值较大者优先。 |
| `blend` | `replace`（默认）或 `max` | v1 接受并保留该字段；同一 `source + eventId` 的更新仍以完整目标集替换旧事件。 |
| `baselineBlend` | `boost`（默认）、`replace` 或 `max` | 当前胜出的瞬态值与胜出基线值的合成方式。 |

所有数值必须是有限数。`intensity`、`frequency`、`rotateSpeed` 会夹到 0–100；`durationMs`、渐变和脉冲时间会夹到 0–600000 ms。协议不控制设备的最大强度或最大旋转速度。

支持的叶子部位为：`mouth`、`breast`、`nipple`、`armpit`、`clitoris`、`vulva`、`vagina`、`urethra`、`anus`、`butt`、`penis`、`prostate`。

支持的虚拟组为：`genitals`、`lower_body`、`double_hole`、`whole_body`、`mixed`。组到叶子部位的权重由 XToys 配置决定；游戏应在能区分时发送叶子部位。

## 命令与可复制示例

### `play`

创建有限事件，或以更高序号替换同一 `source + eventId`。`targets` 至少一个，且每个目标必须有正的 `durationMs`。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"play\",\"source\":\"my-game\",\"eventId\":\"strike-42\",\"sequence\":1,\"states\":[\"combat\"],\"targets\":[{\"part\":\"vagina\",\"effect\":\"pulse\",\"intensity\":70,\"frequency\":35,\"durationMs\":1200,\"rampUpMs\":150,\"rampDownMs\":250,\"pulseOnMs\":180,\"pulseOffMs\":120,\"priority\":20,\"baselineBlend\":\"boost\"}]}"
}
```

### `update`：显式反转方向

以同一事件 ID 的较高序号更新整个目标集。运行中的旋转不会自动反转；要反转必须明确发送新的 `rotateDirection`。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"update\",\"source\":\"my-game\",\"eventId\":\"drill-7\",\"sequence\":2,\"targets\":[{\"part\":\"vagina\",\"rotateSpeed\":60,\"rotateDirection\":\"counterclockwise\",\"durationMs\":1500,\"rampUpMs\":100,\"rampDownMs\":200}]}"
}
```

### `stop`

`eventId` 单独出现时移除该来源的完整事件；`eventId + targets` 只移除该事件中的列出部位；没有 `eventId` 时必须提供非空 `targets`，并移除该来源所有事件中的这些部位。`sequence` 可选，但 `stop` 不使用它做顺序仲裁。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"stop\",\"source\":\"my-game\",\"eventId\":\"strike-42\",\"targets\":[{\"part\":\"vagina\"}]}"
}
```

### `set_baseline`：替换基线快照

基线适用于持续状态，例如异常状态。此命令替换该 `source` 的完整基线快照，而不是增加一条状态；`states` 仅供诊断。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"set_baseline\",\"source\":\"my-game\",\"sequence\":5,\"states\":[\"heat\"],\"targets\":[{\"part\":\"clitoris\",\"intensity\":25,\"frequency\":20,\"rampUpMs\":500,\"rampDownMs\":500},{\"part\":\"vagina\",\"rotateSpeed\":20,\"rotateDirection\":\"clockwise\",\"rampUpMs\":500,\"rampDownMs\":500}]}"
}
```

### `set_baseline`：清空该来源的基线

空 `targets` 是该来源的完整空快照；它不会停止有限事件。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"set_baseline\",\"source\":\"my-game\",\"sequence\":6,\"targets\":[]}"
}
```

### `stop_all`

立即清除所有来源的基线和有限事件，并以零渐变将每个已启用槽写为零。它优先于普通仲裁。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"stop_all\",\"source\":\"my-game\"}"
}
```

### `test`

`test` 验证并记录预览，不改变运行状态，也不启动物理输出 Job。可带 `targets`（可为空）与可选 `sequence`，但不能替代硬件测试。

```json
{
  "action": "xtoys_game_bridge",
  "payload": "{\"protocolVersion\":1,\"command\":\"test\",\"source\":\"my-game\",\"targets\":[{\"part\":\"clitoris\",\"intensity\":50}]}"
}
```

## 路由、仲裁和时间语义

XToys 先将虚拟组权重、叶子到槽的路由权重和 `globalMultiplier` 相乘，再夹到 0–100。一个强度槽只读 `intensity`，一个旋转槽只读 `rotateSpeed`；同一目标可以同时包含两者，以驱动不同的独立槽。

同一槽有多个候选时，基线取有效值最高者。瞬态依次按 `priority`、有效值、`sequence`、接受时间和 generation 选择胜者。默认 `boost` 为 `B + A * (100 - B) / 100`；`replace` 使用瞬态值，`max` 使用两者较大值。旋转方向不做数值混合：瞬态脉冲开区间使用瞬态的显式方向，关区间和结束后回到胜出基线的方向。

`pulse` 的开关按 `(当前时间 - 接受时间) % (pulseOnMs + pulseOffMs)` 计算。调度器每 0.1 秒调用一次，因此到期、脉冲切换和基线恢复在下一次调度时落到物理槽；旧 generation 不得将较新事件归零。

## 限制与失败处理

- 外层映射得到的 `payload` 字符串最多 32768 个字符（32 KiB）。
- 一条消息最多 32 个 `targets`、最多 32 个 `states` 标签。
- 有限事件时长及每个渐变/脉冲时间字段最大 600000 ms。
- 无效 JSON、未知命令/部位/组、缺失必填字段、无效数值或方向会被拒绝，且不会修改当前输出状态。
- 仅有 `stop_all` 的版本、命令和非空 `source` 会先被接受，以便始终可以请求全停。

XToys 模板配置与 Webhook/Job 接线请见 [一次性 XToys 模板配置](xtoys-template-setup.md)。
