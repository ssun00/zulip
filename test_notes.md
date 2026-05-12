## Create RSVP

### Bugs

- Meeting Topic throw Script error in New Realm?

- submit error

```
 Error: Assertion failed
 at assert .pnpm/minimalistic-assert@1.0.1/node_modules/minimalistic-assert/index.js:5
 at submit_rsvp_meeting_form /src/add_meeting_ui.ts:37
 at /src/dialog_widget.ts:298
 at dispatch .pnpm/jquery@4.0.0/node_modules/jquery/dist-module/jquery.module.js:4874
```

### Feature

- user itself be added by default?
- new channel without adding default user?



## Requirements

top 3 day and time
same time interval

Test part
testing plan 3
UI

Testing
ask for friends to test User function
Aprt 30th
when-to-meet done


---

## 测试方案 - RSVP会议功能

### 测试策略

#### 1. 单元测试
文件: `web/tests/add_meeting_ui.test.cjs`

#### 2. 集成测试场景

| 测试场景 | 预期结果 | 优先级 |
|----------|----------|--------|
| 在频道narrow中打开RSVP modal | Submit按钮根据条件启用/禁用 | P0 |
| 在DM/Combined feed中打开RSVP modal | Submit按钮被禁用( stream_id undefined ) | P0 |
| 填写所有必填字段 | Submit按钮启用，可提交 | P0 |
| 不填写topic | Submit按钮禁用 | P0 |
| 不选择日期时间 | Submit按钮禁用 | P0 |
| 不添加邀请用户 | Submit按钮禁用 | P0 |
| 点击"Add all users" | 频道订阅者被添加到邀请列表 | P1 |
| 有外部用户时显示警告 | 警告出现且"create channel" checkbox被禁用 | P1 |
| 日期选择器打开 | 日历正确渲染，位置合理 | P2 |

---

### 测试用例详情

#### 4.1 Submit Button状态测试

| ID | 前置条件 | 操作 | 预期结果 |
|----|----------|------|----------|
| TC-01 | 打开RSVP modal，在DM narrow | - | Submit按钮禁用 |
| TC-02 | 打开RSVP modal，在channel narrow | - | Submit按钮根据其他条件状态决定 |
| TC-03 | topic为空 | 输入任意内容后删除 | Submit按钮保持禁用 |
| TC-04 | datetime为空 | - | Submit按钮禁用 |
| TC-05 | 无邀请用户 | 添加至少一个用户 | Submit按钮可启用(若其他条件满足) |
| TC-06 | 所有条件满足 | - | Submit按钮启用 |

#### 4.2 表单提交测试

| ID | 场景 | 操作 | 预期结果 |
|----|------|------|----------|
| TC-07 | 在channel narrow填写完整 | 点击Submit | 消息发送成功，modal关闭 |
| TC-08 | 未在channel narrow | 点击Submit | 无效(按钮应该禁用) |
| TC-09 | 创建新频道选项 | 勾选并提交 | 创建新频道并发送消息 |

#### 4.3 UI交互测试

| ID | 场景 | 操作 | 预期结果 |
|----|------|------|----------|
| TC-10 | Add all users | 点击按钮 | 所有频道订阅者被添加 |
| TC-11 | 用户搜索 | 输入搜索词 | 下拉列表正确过滤 |
| TC-12 | 日期时间选择 | 点击输入框 | flatpickr日历打开 |
| TC-13 | 有外部用户 | 添加不在频道的用户 | 警告显示 |

---

### 测试执行命令

```bash
# 运行前端测试
./tools/test-js-with-node web/tests/add_meeting_ui.test.cjs

# 运行所有相关测试
./tools/test-js-with-node --grep "rsvp\|add_meeting"
```

---

### 手动测试清单

- [ ] 在频道narrow中测试RSVP modal
- [ ] 在DM narrow中测试RSVP modal
- [ ] 验证submit按钮状态变化
- [ ] 测试"Add all users"功能
- [ ] 测试日期时间选择器
- [ ] 测试用户搜索下拉
- [ ] 验证外部用户警告
- [ ] 测试创建新频道流程

---

### 建议补充的测试用例

当前测试文件缺少对以下场景的覆盖:

1. **stream_id为undefined时的按钮状态** - 当前测试只mock了`on_add_all_users_click`，但没有直接测试`update_rsvp_submit_button_state`在`stream_id`为undefined时的行为

```javascript
run_test("submit button disabled when stream_id is undefined", () => {
    current_stream_id = undefined;
    // 调用 update_rsvp_submit_button_state 并验证按钮被禁用
});
```

---

### 已知Bug

1. **Meeting Topic在New Realm抛出Script错误** - 需在真实新realm环境测试
2. **Submit error: Assertion failed** - 最新提交已修复 `stream_id === undefined` 的情况

---

Testing
ask for friends to test User function
Aprt 30th
when-to-meet done