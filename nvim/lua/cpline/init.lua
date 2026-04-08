local layout = require("cpline.layout")
local backend = require("cpline.backend")
local deps = require("cpline.deps")

local M = {}

-- aliases --

local api = vim.api
local json_encode = vim.json.encode
local format = string.format

-- helpers --

local function default_state()
    return {
        model = nil,
        session_id = nil,
        total_cost = 0,
        total_tokens_in = 0,
        total_tokens_out = 0,
        message_count = 0,
    }
end

local function truncate(s, limit)
    if #s > limit then return s:sub(1, limit) .. "\n..." end
    return s
end

-- state --

M.state = default_state()

-- public --

function M.open()
    layout.open()
    M._setup_keymaps()
end

function M.close()
    backend.cancel()
    layout.close()
end

function M.submit()
    local prompt = layout.consume_input()
    if not prompt then return end

    M.state.message_count = M.state.message_count + 1

    layout.set_streaming(true)
    layout.append_separator("  YOU", "CplineUser")
    layout.append_conv(prompt)
    layout.append_separator("  CLAUDE", "CplineAssistant")

    M._update_status("thinking...")

    backend.send(prompt, {
        on_init = function(event)
            M.state.session_id = event.session_id
            M.state.model = event.model
            M._update_status("streaming...")
        end,

        on_text = function(text)
            layout.append_conv(text)
        end,

        on_tool_use = function(tool)
            local name = tool.name or "unknown"
            local input_preview = ""
            if tool.input then
                local ok, json = pcall(json_encode, tool.input)
                if ok then input_preview = " " .. truncate(json, 120) end
            end
            layout.append_separator(format("  [%s]%s", name, input_preview), "CplineTool")
        end,

        on_tool_result = function(result)
            local content = result.content
            if type(content) == "string" and #content > 0 then
                layout.append_conv(truncate(content, 500) .. "\n")
            elseif type(content) == "table" then
                for i = 1, #content do
                    local block = content[i]
                    if block.type == "text" and block.text then
                        layout.append_conv(truncate(block.text, 500) .. "\n")
                    end
                end
            end
        end,

        on_result = function(event)
            if event.cost_usd then
                M.state.total_cost = M.state.total_cost + event.cost_usd
            elseif event.total_cost_usd then
                M.state.total_cost = event.total_cost_usd
            end
            if event.usage then
                if event.usage.input_tokens then
                    M.state.total_tokens_in = M.state.total_tokens_in + event.usage.input_tokens
                end
                if event.usage.output_tokens then
                    M.state.total_tokens_out = M.state.total_tokens_out + event.usage.output_tokens
                end
            end
            M._update_status("done")
            vim.notify(format("Done ($%.4f)", M.state.total_cost))
        end,

        on_error = function(err)
            layout.append_separator("  ERROR " .. tostring(err), "CplineError")
            M._update_status("error")
        end,

        on_exit = function(code)
            layout.set_streaming(false)
            if code ~= 0 then
                layout.append_separator(format("  EXIT CODE %d", code), "CplineError")
            end
            M._update_status("ready")
            layout.focus_input()
        end,
    })
end

function M.new_session()
    backend.reset_session()
    M.state = default_state()
    layout.clear_conv()
    layout.update_status({})
end

function M.submit_text(text)
    if not layout.layout then return end
    api.nvim_buf_set_lines(layout.layout.input_buf, 0, -1, false, { text })
    M.submit()
end

-- keymaps --

function M._setup_keymaps()
    if not layout.layout then return end

    local l = layout.layout

    vim.keymap.set({ "n", "i" }, "<C-s>", function() M.submit() end, { buffer = l.input_buf })
    vim.keymap.set({ "n", "i" }, "<C-c>", function()
        backend.cancel()
        M._update_status("cancelled")
    end, { buffer = l.input_buf })
    vim.keymap.set("n", "<C-n>", function() M.new_session() end, { buffer = l.input_buf })
    vim.keymap.set("n", "q", function() M.close() end, { buffer = l.conv_buf })

    local bufs = { l.input_buf, l.conv_buf, l.status_buf }
    for i = 1, #bufs do
        vim.keymap.set({ "n", "i" }, "<C-q>", function() M.close() end, { buffer = bufs[i] })
    end

    local function cycle()
        if not layout.layout then return end
        local cur = api.nvim_get_current_win()
        if cur == l.input_win then
            api.nvim_set_current_win(l.conv_win)
        elseif cur == l.conv_win then
            api.nvim_set_current_win(l.status_win)
        else
            layout.focus_input()
        end
    end

    for i = 1, #bufs do
        vim.keymap.set("n", "<Tab>", cycle, { buffer = bufs[i] })
    end
end

function M._update_status(status)
    layout.update_status({
        session_id = M.state.session_id,
        model = M.state.model,
        cost = M.state.total_cost > 0 and M.state.total_cost or nil,
        tokens_in = M.state.total_tokens_in > 0 and M.state.total_tokens_in or nil,
        tokens_out = M.state.total_tokens_out > 0 and M.state.total_tokens_out or nil,
        status = status,
    })
end

-- highlights --

function M._setup_highlights()
    local deep     = "#0a0e14"
    local surface  = "#111827"
    local elevated = "#1a2332"
    local hover    = "#1f2a3a"

    local blue = "#5b8cf0"
    local glow = "#7ba6ff"

    local primary   = "#d4dae3"
    local secondary = "#8891a0"
    local muted     = "#5c6573"

    local green = "#3ec97a"
    local amber = "#e8a83e"
    local red   = "#e05c5c"

    local border = "#1e293b"

    local hl = api.nvim_set_hl
    hl(0, "CplineBg",          { bg = deep, fg = deep })
    hl(0, "CplineConv",        { bg = deep, fg = primary })
    hl(0, "CplineStatus",      { bg = surface, fg = secondary })
    hl(0, "CplineInput",       { bg = elevated, fg = primary })
    hl(0, "CplineBorder",      { fg = border })
    hl(0, "CplineFloatTitle",  { fg = glow, bold = true })
    hl(0, "CplineFloatFooter", { fg = muted })
    hl(0, "CplineUser",        { fg = blue, bold = true })
    hl(0, "CplineAssistant",   { fg = green, bold = true })
    hl(0, "CplineTool",        { fg = amber, italic = true })
    hl(0, "CplineError",       { fg = red, bold = true })
    hl(0, "CplineLabel",       { fg = muted, bold = true })
    hl(0, "CplineReady",       { fg = green })
    hl(0, "CplineActive",      { fg = glow })
    hl(0, "CplineBar",         { fg = blue })
    hl(0, "CplineWarning",     { fg = amber })
    hl(0, "CplineMuted",       { fg = muted })
    hl(0, "CursorLine",        { bg = hover })
    hl(0, "Normal",            { bg = deep, fg = primary })
    hl(0, "NormalFloat",       { bg = surface, fg = primary })

    -- mini.statusline
    hl(0, "MiniStatuslineNormal",    { bg = surface, fg = primary })
    hl(0, "MiniStatuslineInsert",    { bg = blue, fg = deep, bold = true })
    hl(0, "MiniStatuslineVisual",    { bg = amber, fg = deep, bold = true })
    hl(0, "MiniStatuslineCommand",   { bg = green, fg = deep, bold = true })
    hl(0, "MiniStatuslineReplace",   { bg = red, fg = deep, bold = true })
    hl(0, "MiniStatuslineOther",     { bg = surface, fg = secondary })
    hl(0, "MiniStatuslineFilename",  { bg = deep, fg = secondary })
    hl(0, "MiniStatuslineFileinfo",  { bg = deep, fg = muted })
    hl(0, "MiniStatuslineDevinfo",   { bg = deep, fg = muted })
    hl(0, "MiniStatuslineInactive",  { bg = deep, fg = muted })

    -- mini.notify
    hl(0, "MiniNotifyBorder", { fg = border })
    hl(0, "MiniNotifyNormal", { bg = surface, fg = primary })
    hl(0, "MiniNotifyTitle",  { fg = glow, bold = true })

    -- mini.cursorword
    hl(0, "MiniCursorword",        { underline = true, sp = border })
    hl(0, "MiniCursorwordCurrent", { underline = true, sp = border })

    -- render-markdown
    hl(0, "RenderMarkdownBg1",  { bg = "#0f1520" })
    hl(0, "RenderMarkdownBg2",  { bg = "#111a28" })
    hl(0, "RenderMarkdownBg3",  { bg = "#131d2e" })
    hl(0, "RenderMarkdownCode", { bg = surface })
    hl(0, "RenderMarkdownH1",   { fg = blue, bold = true })
    hl(0, "RenderMarkdownH2",   { fg = glow, bold = true })
    hl(0, "RenderMarkdownH3",   { fg = green, bold = true })
    hl(0, "RenderMarkdownH4",   { fg = amber })

    -- general ui
    hl(0, "FloatBorder",  { fg = border })
    hl(0, "WinSeparator", { fg = border })
    hl(0, "Visual",       { bg = "#1e3a5f" })
    hl(0, "Search",       { bg = "#2a4a6f", fg = primary })
    hl(0, "IncSearch",    { bg = blue, fg = deep })
    hl(0, "Pmenu",        { bg = surface, fg = primary })
    hl(0, "PmenuSel",     { bg = elevated, fg = primary })
    hl(0, "StatusLine",   { bg = deep, fg = secondary })
    hl(0, "StatusLineNC", { bg = deep, fg = muted })
end

-- setup --

function M.setup()
    M._setup_highlights()
    deps.setup()
    M._setup_highlights()

    vim.o.laststatus = 2
    vim.o.showmode = false

    api.nvim_create_user_command("Cpline", function() M.open() end, {})
    api.nvim_create_user_command("CplineClose", function() M.close() end, {})
    api.nvim_create_user_command("CplineNew", function() M.new_session() end, {})
end

return M
