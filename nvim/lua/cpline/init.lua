local layout = require("cpline.layout")
local backend = require("cpline.backend")
local preview = require("cpline.preview")
local session = require("cpline.session")
local anim = require("cpline.anim")
local highlight = require("cpline.highlight")
local deps = require("cpline.deps")

local M = {}

-- aliases --

local api = vim.api
local format = string.format
local concat = table.concat
local split = vim.split

-- constants --

local SPLIT_OPTS = { plain = true }
local PLAN_PROMPT = "You are in PLAN mode. Do NOT create, edit, write, or delete any files. Only use read-only operations: Read, Glob, Grep, Bash (read-only commands), and web tools. Explain what you would do, but do not do it."
local EFFORT_LEVELS = { "auto", "low", "medium", "high" }

-- helpers --

local function truncate(s, limit)
    if #s > limit then return s:sub(1, limit) .. "..." end
    return s
end

-- public --

function M.open()
    local sess = session.create()
    layout.open(sess.conv_buf)
    M._setup_keymaps()
    M._refresh()
end

function M.close()
    for i = 1, session.count() do
        local sess = session.sessions[i]
        backend.cancel(sess.backend)
    end
    layout.close()
end

function M.toggle_mode()
    local sess = session.get()
    if not sess then return end
    if sess.mode == "plan" then
        sess.mode = "exec"
    else
        sess.mode = "plan"
    end
    M._refresh()
end

function M.cycle_effort()
    local sess = session.get()
    if not sess then return end
    local current = sess.effort or "auto"
    for i = 1, #EFFORT_LEVELS do
        if EFFORT_LEVELS[i] == current then
            sess.effort = EFFORT_LEVELS[i % #EFFORT_LEVELS + 1]
            break
        end
    end
    M._refresh()
end

function M._model_picker()
    local ok, pick = pcall(require, "mini.pick")
    if not ok then return end

    local models = {
        { text = "sonnet", alias = "sonnet" },
        { text = "opus", alias = "opus" },
        { text = "haiku", alias = "haiku" },
    }

    pick.start({
        source = {
            name = "Model",
            items = models,
            choose = function(item)
                if item then
                    vim.schedule(function() M._handle_command("/model " .. item.alias) end)
                end
            end,
        },
    })
end

function M.submit()
    local prompt = layout.consume_input()
    if not prompt then return end

    if prompt:sub(1, 1) == "/" then
        M._handle_command(prompt)
        return
    end

    local sess = session.get()
    if not sess then return end

    local buf = sess.conv_buf
    local state = sess.state
    local bstate = sess.backend
    local is_first = state.message_count == 0

    state.message_count = state.message_count + 1
    state.last_send_time = vim.uv.hrtime()

    layout.set_streaming(true)
    layout.separator_to_buf(buf, "  YOU", "CplineUser")
    layout.append_to_buf(buf, prompt)
    layout.separator_to_buf(buf, "  CLAUDE", "CplineAssistant")

    if session.get() == sess then
        M._scroll_conv()
        M._update_status("thinking...")
        anim.start(buf, "thinking", "thinking...", "CplineThinking")
    end

    if #sess.attachments > 0 then
        local attached = {}
        for i = 1, #sess.attachments do
            attached[i] = format("--- %s ---\n%s", sess.attachments[i].name, sess.attachments[i].content)
        end
        prompt = concat(attached, "\n\n") .. "\n\n" .. prompt
        sess.attachments = {}
    end

    local opts = {}
    if sess.model_override then
        opts.model = sess.model_override
    end

    local system_parts = {}
    if sess.mode == "plan" then
        system_parts[#system_parts + 1] = PLAN_PROMPT
    end
    local agents_md = M._read_agents_md()
    if agents_md then
        system_parts[#system_parts + 1] = agents_md
    end
    if #system_parts > 0 then
        opts.system_prompt = concat(system_parts, "\n\n")
    end

    backend.send(bstate, prompt, {
        on_init = function(event)
            bstate.session_id = event.session_id
            state.session_id = event.session_id
            state.model = event.model
            anim.stop(buf)
            if session.get() == sess then
                anim.start(buf, "streaming", "streaming...", "CplineActive")
                M._update_status("streaming...")
            end
        end,

        on_text = function(text)
            anim.stop(buf)
            preview.dismiss()
            layout.append_to_buf(buf, text)
            if session.get() == sess then
                M._scroll_conv()
            end
        end,

        on_thinking = function(text)
            if text ~= "" then
                layout.separator_to_buf(buf, "  thinking...", "CplineThinking")
            end
            if session.get() == sess then
                M._scroll_conv()
            end
        end,

        on_tool_use = function(tool)
            anim.stop(buf)
            local name = tool.name or "unknown"
            local input = tool.input or {}
            local desc = M._format_tool(name, input)
            layout.separator_to_buf(buf, desc, "CplineTool")
            anim.start(buf, "tool", name .. "...", "CplineTool")

            if name == "Edit" and input.old_string and input.new_string then
                local old_n = #split(input.old_string, "\n", SPLIT_OPTS)
                local new_n = #split(input.new_string, "\n", SPLIT_OPTS)
                state.lines_removed = state.lines_removed + old_n
                state.lines_added = state.lines_added + new_n
            elseif name == "Write" and input.content then
                state.lines_added = state.lines_added + #split(input.content, "\n", SPLIT_OPTS)
            end

            if session.get() == sess then
                if input.file_path then
                    local line_count = api.nvim_buf_line_count(buf)
                    layout.add_right_hint(buf, line_count - 2, input.file_path, "CplineMuted")
                end
                M._scroll_conv()
                if name == "Edit" and input.file_path then
                    preview.show_edit(input)
                elseif name == "Write" and input.file_path then
                    preview.show_write(input)
                end
            end
        end,

        on_tool_result = function(result)
            local content = result.content
            if type(content) == "string" and #content > 0 then
                layout.append_to_buf(buf, truncate(content, 500) .. "\n")
            elseif type(content) == "table" then
                for i = 1, #content do
                    local block = content[i]
                    if block.type == "text" and block.text then
                        layout.append_to_buf(buf, truncate(block.text, 500) .. "\n")
                    end
                end
            end
            if session.get() == sess then
                M._scroll_conv()
            end
        end,

        on_result = function(event)
            if event.cost_usd then
                state.total_cost = state.total_cost + event.cost_usd
            elseif event.total_cost_usd then
                state.total_cost = event.total_cost_usd
            end
            if event.usage then
                local u = event.usage
                if u.input_tokens then
                    state.total_tokens_in = state.total_tokens_in + u.input_tokens
                    state.last_input_tokens = u.input_tokens
                end
                if u.output_tokens then
                    state.total_tokens_out = state.total_tokens_out + u.output_tokens
                end
                if u.cache_creation_input_tokens then
                    state.cache_creation = state.cache_creation + u.cache_creation_input_tokens
                end
                if u.cache_read_input_tokens then
                    state.cache_read = state.cache_read + u.cache_read_input_tokens
                end
            end
            if state.last_send_time then
                state.last_response_ms = (vim.uv.hrtime() - state.last_send_time) / 1e6
            end

            local subtype = event.subtype or "success"
            local status_msg = "done"
            if subtype == "error_max_turns" then
                status_msg = "max turns reached"
                layout.separator_to_buf(buf, "  max turns reached", "CplineWarning")
            elseif subtype == "error_max_budget_usd" then
                status_msg = "budget limit"
                layout.separator_to_buf(buf, "  budget limit reached", "CplineWarning")
            elseif subtype == "error_during_execution" then
                status_msg = "error"
                layout.separator_to_buf(buf, "  error during execution", "CplineError")
            end

            if session.get() == sess then
                M._update_status(status_msg)
            end
            vim.notify(format("Done ($%.4f)", state.total_cost))
        end,

        on_tool_progress = function(event)
            local elapsed = event.elapsed_seconds or event.elapsedSeconds
            if elapsed and session.get() == sess then
                M._update_status(format("tool... %ds", elapsed))
            end
        end,

        on_rate_limit = function(event)
            local msg = "Rate limited"
            if event.resets_at then
                local secs = event.resets_at - os.time()
                if secs > 0 then
                    msg = format("Rate limited (resets in %dm)", math.ceil(secs / 60))
                end
            end
            layout.separator_to_buf(buf, "  " .. msg, "CplineWarning")
            if session.get() == sess then
                M._scroll_conv()
                M._update_status("rate limited")
            end
        end,

        on_error = function(err)
            layout.separator_to_buf(buf, "  ERROR " .. tostring(err):gsub("\n", " "), "CplineError")
            if session.get() == sess then
                M._scroll_conv()
                M._update_status("error")
            end
        end,

        on_exit = function(code)
            anim.stop(buf)
            preview.dismiss()
            layout.set_streaming(false)
            if code ~= 0 then
                layout.separator_to_buf(buf, format("  EXIT CODE %d", code), "CplineError")
            end
            if session.get() == sess then
                M._scroll_conv()
                M._update_status("ready")
                layout.focus_input()
            end
        end,
    }, opts)

    if is_first then
        local label = prompt:sub(1, 30)
        if #prompt > 30 then label = label .. "..." end
        local idx = session.index_of(sess)
        if idx then session.set_label(idx, label) end
    end
end

function M.new_session()
    local sess = session.create()
    session.switch(session.count())
    layout.swap_conv_buf(sess.conv_buf)
    M._setup_conv_keymaps(sess.conv_buf)
    M._refresh()
    layout.focus_input()
end

function M.next_session()
    if session.count() < 2 then return end
    local idx = session.current % session.count() + 1
    session.switch(idx)
    layout.swap_conv_buf(session.get().conv_buf)
    M._refresh()
end

function M.prev_session()
    if session.count() < 2 then return end
    local idx = (session.current - 2) % session.count() + 1
    session.switch(idx)
    layout.swap_conv_buf(session.get().conv_buf)
    M._refresh()
end

function M.close_session()
    if session.count() < 2 then
        vim.notify("Cannot close the last session")
        return
    end
    local old_idx = session.current
    local old_backend = session.get().backend

    local new_idx = old_idx > 1 and old_idx - 1 or old_idx + 1
    session.switch(new_idx)
    layout.swap_conv_buf(session.get().conv_buf)

    backend.cancel(old_backend)
    session.close(old_idx)

    M._refresh()
    layout.focus_input()
end

function M.submit_text(text)
    if not layout.layout then return end
    api.nvim_buf_set_lines(layout.layout.input_buf, 0, -1, false, { text })
    M.submit()
end

-- internal --

local function basename(path)
    return path:match("([^/]+)$") or path
end

local cached_agents = { content = nil, checked = false }

function M._read_agents_md()
    if cached_agents.checked then return cached_agents.content end
    cached_agents.checked = true
    local cwd = vim.fn.getcwd()
    local paths = { cwd .. "/AGENTS.md", cwd .. "/.agents.md" }
    for i = 1, #paths do
        local fd = io.open(paths[i], "r")
        if fd then
            cached_agents.content = fd:read("*a")
            fd:close()
            return cached_agents.content
        end
    end
    return nil
end

function M._handle_command(input)
    local cmd = input:match("^/(%S+)")
    if not cmd then return end

    local sess = session.get()

    if cmd == "cost" then
        if not sess then return end
        local state = sess.state
        local parts = {
            format("Session cost: $%.4f", state.total_cost),
            format("Tokens: %s in / %s out / %s cached",
                layout.format_tokens(state.total_tokens_in),
                layout.format_tokens(state.total_tokens_out),
                layout.format_tokens(state.cache_read)),
            format("Messages: %d", state.message_count),
        }
        if state.lines_added > 0 or state.lines_removed > 0 then
            parts[#parts + 1] = format("Lines: +%d -%d", state.lines_added, state.lines_removed)
        end
        if state.last_response_ms then
            parts[#parts + 1] = format("Last response: %.1fs", state.last_response_ms / 1000)
        end
        layout.separator_to_buf(sess.conv_buf, "  /cost", "CplineMuted")
        layout.append_to_buf(sess.conv_buf, concat(parts, "\n"))
        M._scroll_conv()

    elseif cmd == "clear" then
        if not sess then return end
        vim.bo[sess.conv_buf].modifiable = true
        api.nvim_buf_set_lines(sess.conv_buf, 0, -1, false, { "" })
        vim.bo[sess.conv_buf].modifiable = false

    elseif cmd == "plan" then
        if sess then sess.mode = "plan" end
        M._refresh()

    elseif cmd == "exec" then
        if sess then sess.mode = "exec" end
        M._refresh()

    elseif cmd == "sessions" then
        require("cpline.history").open()

    elseif cmd == "new" then
        M.new_session()

    elseif cmd == "compact" then
        if not sess then return end
        layout.separator_to_buf(sess.conv_buf, "  /compact", "CplineMuted")
        layout.append_to_buf(sess.conv_buf, "Compacting conversation...")
        M._scroll_conv()
        M.submit_text("Please provide a concise summary of our conversation so far. Include key decisions, code changes made, and current state. This will be used to continue the conversation with reduced context.")

    elseif cmd == "model" then
        if not sess then return end
        local model_arg = input:match("^/model%s+(.+)$")
        if not model_arg then
            local current = sess.model_override or sess.state.model or "default"
            layout.separator_to_buf(sess.conv_buf, "  /model", "CplineMuted")
            layout.append_to_buf(sess.conv_buf, "Current model: " .. current .. "\nUsage: /model <name> (e.g., sonnet, opus, haiku)")
            M._scroll_conv()
            return
        end
        local aliases = {
            sonnet = "claude-sonnet-4-20250514",
            opus = "claude-opus-4-20250514",
            haiku = "claude-haiku-4-5-20251001",
        }
        sess.model_override = aliases[model_arg] or model_arg
        layout.separator_to_buf(sess.conv_buf, "  /model", "CplineMuted")
        layout.append_to_buf(sess.conv_buf, "Switched to: " .. sess.model_override)
        M._scroll_conv()

    elseif cmd == "file" or cmd == "attach" then
        if not sess then return end
        local path = input:match("^/%S+%s+(.+)$")
        if not path then
            layout.separator_to_buf(sess.conv_buf, "  /file", "CplineMuted")
            layout.append_to_buf(sess.conv_buf, "Usage: /file <path>")
            M._scroll_conv()
            return
        end
        path = vim.fn.expand(path)
        local fd = io.open(path, "r")
        if not fd then
            layout.separator_to_buf(sess.conv_buf, "  /file", "CplineError")
            layout.append_to_buf(sess.conv_buf, "Cannot read: " .. path)
            M._scroll_conv()
            return
        end
        local content = fd:read("*a")
        fd:close()
        sess.attachments[#sess.attachments + 1] = {
            name = basename(path),
            content = content,
        }
        layout.separator_to_buf(sess.conv_buf, "  /file", "CplineMuted")
        layout.append_to_buf(sess.conv_buf, format("Attached: %s (%d lines)", basename(path), #split(content, "\n", SPLIT_OPTS)))
        M._scroll_conv()

    else
        vim.notify("Unknown command: /" .. cmd)
    end
end

function M._format_tool(name, input)
    local detail = ""
    if name == "Bash" then
        local cmd = input.command or ""
        cmd = cmd:gsub("\n", " ")
        if #cmd > 60 then cmd = cmd:sub(1, 60) .. "..." end
        detail = "$ " .. cmd
    elseif name == "Read" and input.file_path then
        detail = basename(input.file_path)
    elseif name == "Edit" and input.file_path then
        local old_n = input.old_string and #split(input.old_string, "\n", SPLIT_OPTS) or 0
        local new_n = input.new_string and #split(input.new_string, "\n", SPLIT_OPTS) or 0
        detail = format("%s -%d +%d", basename(input.file_path), old_n, new_n)
    elseif name == "Write" and input.file_path then
        local n = input.content and #split(input.content, "\n", SPLIT_OPTS) or 0
        detail = format("%s %dL", basename(input.file_path), n)
    elseif name == "Glob" then
        detail = input.pattern or ""
    elseif name == "Grep" then
        detail = input.pattern or ""
    end

    local header = "\u{256D}\u{2500} " .. name
    if detail ~= "" then header = header .. " \u{00B7} " .. detail .. " " end
    return header
end

function M._refresh()
    local sess = session.get()
    if not sess then return end
    layout.update_input_title(sess.mode, sess.effort)
    M._update_status(sess.backend.running and "streaming..." or "ready")
end

function M._scroll_conv()
    if not layout.layout then return end
    local win = layout.layout.conv_win
    if api.nvim_win_is_valid(win) then
        local buf = api.nvim_win_get_buf(win)
        local line_count = api.nvim_buf_line_count(buf)
        api.nvim_win_set_cursor(win, { line_count, 0 })
    end
end

-- keymaps --

local function set_global_keymaps(buf)
    local modes = { "n", "i" }
    vim.keymap.set(modes, "<C-q>", function() M.close() end, { buffer = buf })
    vim.keymap.set(modes, "<Tab>", function() M.toggle_mode() end, { buffer = buf })
    vim.keymap.set(modes, "<C-t>", function() M.cycle_effort() end, { buffer = buf })
    vim.keymap.set(modes, "<C-n>", function() M.new_session() end, { buffer = buf })
    vim.keymap.set(modes, "<C-h>", function() require("cpline.history").open() end, { buffer = buf })
    vim.keymap.set(modes, "<C-c>", function()
        local sess = session.get()
        if sess then
            backend.cancel(sess.backend)
            M._update_status("cancelled")
        end
    end, { buffer = buf })
    vim.keymap.set(modes, "<C-p>m", function() M._model_picker() end, { buffer = buf, desc = "Switch Model" })
    vim.keymap.set(modes, "<C-p>c", function() M._handle_command("/cost") end, { buffer = buf, desc = "Cost Info" })
    vim.keymap.set(modes, "<C-p>x", function() M._handle_command("/compact") end, { buffer = buf, desc = "Compact" })
    vim.keymap.set(modes, "<C-p>l", function() M._handle_command("/clear") end, { buffer = buf, desc = "Clear" })
    vim.keymap.set(modes, "<C-p>n", function() M.new_session() end, { buffer = buf, desc = "New Session" })
    vim.keymap.set(modes, "<C-p>h", function() require("cpline.history").open() end, { buffer = buf, desc = "History" })

    MiniClue.ensure_buf_triggers(buf)
end

function M._setup_conv_keymaps(buf)
    set_global_keymaps(buf)
    vim.keymap.set("n", "q", function() M.close() end, { buffer = buf })
    vim.keymap.set("n", "gt", function() M.next_session() end, { buffer = buf })
    vim.keymap.set("n", "gT", function() M.prev_session() end, { buffer = buf })
    vim.keymap.set("n", "i", function() layout.focus_input() end, { buffer = buf })
    vim.keymap.set({ "n", "i" }, "<C-p>d", function() M.close_session() end, { buffer = buf, desc = "Close Session" })

    api.nvim_create_autocmd("BufEnter", {
        buffer = buf,
        callback = function()
            local idx = session.find_by_buf(buf)
            if idx and idx ~= session.current then
                session.switch(idx)
                M._refresh()
            end
        end,
    })
end

function M._setup_keymaps()
    if not layout.layout then return end

    local l = layout.layout

    -- input: always insert mode, Enter sends, Shift+Enter for newline
    set_global_keymaps(l.input_buf)
    vim.keymap.set("i", "<CR>", function() M.submit() end, { buffer = l.input_buf })
    vim.keymap.set("i", "<S-CR>", function()
        local row, col = unpack(api.nvim_win_get_cursor(0))
        local line = api.nvim_get_current_line()
        api.nvim_buf_set_lines(l.input_buf, row - 1, row, false, { line:sub(1, col), line:sub(col + 1) })
        api.nvim_win_set_cursor(0, { row + 1, 0 })
    end, { buffer = l.input_buf })
    vim.keymap.set("i", "<Esc>", function()
        if api.nvim_win_is_valid(l.conv_win) then
            vim.cmd("stopinsert")
            api.nvim_set_current_win(l.conv_win)
        end
    end, { buffer = l.input_buf })
    vim.keymap.set("n", "<CR>", function() M.submit() end, { buffer = l.input_buf })

    api.nvim_create_autocmd("BufEnter", {
        buffer = l.input_buf,
        callback = function() vim.cmd("startinsert") end,
    })

    M._setup_conv_keymaps(l.conv_buf)

    set_global_keymaps(l.status_buf)
    vim.keymap.set("n", "i", function() layout.focus_input() end, { buffer = l.status_buf })
    vim.keymap.set("n", "q", function() M.close() end, { buffer = l.status_buf })
end

function M._update_status(status)
    local sess = session.get()
    if not sess then return end
    local state = sess.state

    local context_pct = nil
    if state.last_input_tokens > 0 and state.model then
        local max_ctx = 200000
        context_pct = math.floor((state.last_input_tokens / max_ctx) * 100 + 0.5)
        if context_pct > 100 then context_pct = 100 end
    end

    layout.update_status({
        session_id = state.session_id,
        model = state.model,
        cost = state.total_cost > 0 and state.total_cost or nil,
        tokens_in = state.total_tokens_in > 0 and state.total_tokens_in or nil,
        tokens_out = state.total_tokens_out > 0 and state.total_tokens_out or nil,
        cache_read = state.cache_read > 0 and state.cache_read or nil,
        context_pct = context_pct,
        context_used = state.last_input_tokens > 0 and state.last_input_tokens or nil,
        context_max = state.model and 200000 or nil,
        messages = state.message_count > 0 and state.message_count or nil,
        lines_added = state.lines_added > 0 and state.lines_added or nil,
        lines_removed = state.lines_removed > 0 and state.lines_removed or nil,
        response_ms = state.last_response_ms,
        status = status,
        mode = sess.mode,
        effort = sess.effort,
    })
end

-- setup --

function M.setup()
    highlight.setup()
    deps.setup()

    vim.o.laststatus = 2
    vim.o.showmode = false

    api.nvim_create_user_command("Cpline", function() M.open() end, {})
    api.nvim_create_user_command("CplineClose", function() M.close() end, {})
    api.nvim_create_user_command("CplineNew", function() M.new_session() end, {})
    api.nvim_create_user_command("CplineHistory", function()
        require("cpline.history").open()
    end, {})
end

return M
