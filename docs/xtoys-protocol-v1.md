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
| `source` | string | 每条消息必填、非空；一个稳定的游戏/Bridge 标识；除 `stop_all` 外最多 128 个字符。 |
| `eventId` | string | `play`/`update` 必填；`stop` 可选；最多 128 个字符。 |
| `sequence` | number | 同一有限事件的版本号；`set_baseline` 也必填。 |
| `states` | string[] | 可选诊断标签，最多 32 个；每个标签最多 128 个字符；不参与输出叠加。 |
| `targets` | array | 效果目标；命令是否要求它由下文决定，最多 32 个。 |

`source + eventId` 是有限事件的身份：不同 `source` 可以使用相同的 `eventId` 而互不影响。对同一身份，`play` 或 `update` 只有严格大于当前 `sequence` 才会替换整个事件；重复或较小序号会被忽略。接受时间以 XToys 接受消息的时刻为准，有限事件在 `acceptedAt + durationMs` 到期。

超过上述单字符串限制的普通消息分别返回 `identifier_too_long` 或 `state_label_too_long`。`stop_all` 是紧急归零命令：它仍校验载荷大小、JSON、协议版本、命令、非空 `source`，以及 `states` 的数组类型和最多 32 项限制，但不会因 `source` 或状态标签超过 128 个字符而被阻止。

基线按 `source` 单独保存。一个较新的 `set_baseline` 用该 `source` 的**完整快照**替换旧快照，遗漏的部位会被清除；其 `sequence` 也必须严格递增。`stop` 只操作同一 `source` 的事件。`stop_all` 不按 `source` 区分，会清除全部来源的当前基线和有限事件，但会**保留**每个 `source` 已接受的基线 `sequence` 栅栏。因此，`stop_all` 之后同一 `source` 的下一条 `set_baseline` 仍必须使用大于停机前已接受序号的 `sequence`。重启后的 Bridge 必须持久化并递增该序号，或者改用新的 `source` 身份。

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

### 自适应重复触发（可选）

在瞬态 `hold` 目标上可显式加入以下**恰好七个字段**的 `retrigger` 对象；它不会改变协议版本，也不能用于基线、停止选择器或 `pulse` 目标：

```json
{
  "mode": "adaptive",
  "minDropPercent": 25,
  "maxDropPercent": 100,
  "minRampUpMs": 30,
  "minRampDownMs": 20,
  "textureThresholdMs": 150,
  "quietResetMs": 600
}
```

七个字段均必填，数值必须有限，并满足下列闭区间/相对约束；超出范围返回 `invalid_retrigger`：

| 字段 | 约束 |
| --- | --- |
| `mode` | 必须严格等于 `adaptive`。 |
| `minDropPercent` | `0`–`100`。 |
| `maxDropPercent` | `minDropPercent`–`100`。 |
| `minRampUpMs` | `0`–目标的 `rampUpMs`，且不超过 `600000` ms。 |
| `minRampDownMs` | `0`–目标的 `rampDownMs`，且不超过 `600000` ms。 |
| `textureThresholdMs` | `100`–`600000` ms。 |
| `quietResetMs` | 严格大于 `textureThresholdMs`，且不超过 `600000` ms。 |

另外必须满足 `minRampDownMs + 100 + minRampUpMs <= durationMs`；不满足时返回 `invalid_retrigger_timing`。因此默认最小值 `20 + 100 + 30` 的最短合法目标持续时间为 `150` ms。`durationMs`、目标 ramp 与这两个 cadence 阈值的协议最大值均为 `600000` ms；运行时不会默默保留超过此上界的 retrigger cadence。

连续命中同一 `source + part` 时，运行时在 `quietResetMs` 内以 `0.75 * 旧平均间隔 + 0.25 * 新间隔` 更新 EMA；静默达到该值后清除 cadence。平均间隔低于 `textureThresholdMs` 进入 texture，否则进入 adaptive。adaptive 会从当前胜出基线向下落到按间隔插值的 floor，再按插值 ramp 回到攻击值；所有 fall/rise 时间至少分别为 `minRampDownMs`/`minRampUpMs`，并在剩余持续时间不足时按比例压缩。`textureThresholdMs` 至少为 100 ms，调度器采样周期为 100 ms。

texture 使用不低于 200 ms 的完整周期（按目标/基线两半交替）：floor 半段恢复基线频率，target 半段使用攻击频率；到期后仍由下一次 100 ms tick 清理。`frequencyEnabled: false` 的槽在普通输出、adaptive fall/rise、texture 两相和旋转反转期间都强制输出频率 `0`，不会从 winner 或基线 metadata 泄漏频率。相同来源、相同部位的新事件会取消该部位的旧事件；不同部位即使共享一个物理槽也不会互相删除，前者到期或停止后后者会恢复为仍活跃的胜者。这个恢复不是一次新命中：不会重新执行完整 fall；rise 会按旧事件剩余寿命收紧，少于一个调度周期时立即恢复当前目标。相同输出值本身不会触发重置，必须提供 `retrigger`。

旋转方向更新始终先以当前方向下发零速度，并且只有该零速度 tuple 被适配器确认后，后续调度 pass 才会应用相反方向；adaptive foreground 停止或到期、恢复相反方向的普通 winner/基线时也遵守同一规则。适配器只使用显式 `rotateDirection`，不会推断或自动反转。

### 错误代码

解析/配置错误返回 `ok: false` 与以下代码之一：`invalid_payload`、`payload_too_large`、`invalid_json`、`unsupported_protocol_version`、`unsupported_command`、`missing_source`、`identifier_too_long`、`invalid_states`、`too_many_states`、`state_label_too_long`、`missing_event_id`、`invalid_sequence`、`invalid_duration`、`invalid_targets`、`too_many_targets`、`missing_targets`、`missing_stop_selector`、`unknown_part`、`unknown_group`、`invalid_effect`、`invalid_number`、`invalid_rotate_direction`、`invalid_blend`、`invalid_baseline_blend`、`invalid_retrigger`、`invalid_retrigger_effect`、`invalid_retrigger_timing`、`invalid_config`、`invalid_log_level`、`invalid_global_multiplier`、`invalid_groups`、`missing_group`、`invalid_group_weight`、`invalid_route_weight`、`invalid_slot_count`、`invalid_slot`、`invalid_slot_id`、`invalid_slot_enabled`、`invalid_slot_type`、`invalid_frequency_enabled`。接受命令但因保留状态容量拒绝时返回 `state_capacity_exceeded`；物理下发失败记录 `adapter_apply_failed`，不会伪装成硬件成功。

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

立即清除所有来源的当前基线和有限事件，并以零渐变将每个已启用槽写为零。它优先于普通仲裁，但不清除每个来源已接受的基线 `sequence` 栅栏；发送方恢复基线时必须继续递增该来源的序号。

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
- 除紧急 `stop_all` 外，`source` 与 `eventId` 最多 128 个字符，每个 `states` 标签最多 128 个字符；超限分别返回 `identifier_too_long` 或 `state_label_too_long`。
- 同时有效的有限事件身份最多 128 个，这些事件内仍未到期的目标条目合计最多 256 个。
- 基线 sequence 来源最多保留 64 个（包括当前为空但仍保留 sequence 栅栏的来源），当前基线目标条目合计最多 256 个。
- 有限事件时长及每个渐变/脉冲时间字段最大 600000 ms。
- 超过保留状态容量时返回 `state_capacity_exceeded`。候选更新会整体拒绝，不会部分写入逻辑状态、变量或 XToys Job；停止、到期清理、清空现有基线与 `stop_all` 不受容量门限制。
- 无效 JSON、未知命令/部位/组、缺失必填字段、无效数值或方向会被拒绝，且不会修改当前输出状态。
- `stop_all` 仍会验证外层 `payload` 长度、JSON 对象、`protocolVersion`、支持的 `command` 和非空 `source`。若提供 `states`，它仍必须是最多 32 个字符串的数组。`targets`、XToys 配置验证以及上述单字符串存储长度会被绕过，以便在配置无效、targets 损坏或诊断文本过长时仍可请求全停。

XToys 模板配置与 Webhook/Job 接线请见 [一次性 XToys 模板配置](xtoys-template-setup.md)。
