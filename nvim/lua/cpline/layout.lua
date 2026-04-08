local M = {}

-- aliases --

local api = vim.api
local insert = table.insert
local format = string.format
local floor = math.floor
local max = math.max
local min = math.min

-- constants --

local NS = api.nvim_create_namespace("cpline")
local STATUS_WIDTH = 28
local INPUT_HEIGHT = 3
local PADDING = 1
local BAR_FILLED = "\u{2588}"
local BAR_EMPTY = "\u{2591}"
local BORDER = { "\u{256D}", "\u{2500}", "\u{256E}", "\u{2502}", "\u{256F}", "\u{2500}", "\u{2570}", "\u{2502}" }

-- state --

M.layout = nil

-- helpers --

local function save_and_set_globals()
    local saved = {
        laststatus = vim.o.laststatus,
        showtabline = vim.o.showtabline,
        showmode = vim.o.showmode,
        cmdheight = vim.o.cmdheight,
        ruler = vim.o.ruler,
        fillchars = vim.o.fillchars,
    }
    vim.o.laststatus = 0
    vim.o.showtabline = 0
    vim.o.showmode = false
    vim.o.cmdheight = 0
    vim.o.ruler = false
    vim.o.fillchars = "eob: "
    return saved
end

local function restore_globals(saved)
    for k, v in pairs(saved) do
        vim.o[k] = v
    end
end

local function calc_geometry()
    local ew = vim.o.columns
    local eh = vim.o.lines - 1

    local outer_top = PADDING
    local outer_left = PADDING + 1
    local outer_w = ew - (PADDING * 2) - 2
    local outer_h = eh - (PADDING * 2) - 1

    local conv_w = outer_w - STATUS_WIDTH - 3
    local conv_h = outer_h - INPUT_HEIGHT - 3

    return {
        conv   = { row = outer_top, col = outer_left, width = conv_w, height = conv_h },
        status = { row = outer_top, col = outer_left + conv_w + 2, width = STATUS_WIDTH, height = conv_h },
        input  = { row = outer_top + conv_h + 2, col = outer_left, width = outer_w, height = INPUT_HEIGHT },
        bg     = { width = ew, height = eh },
    }
end

local function open_float(buf, geo, opts)
    opts = opts or {}
    local win_opts = {
        relative = "editor",
        row = geo.row,
        col = geo.col,
        width = max(1, geo.width),
        height = max(1, geo.height),
        style = "minimal",
        border = opts.border and BORDER or "none",
        zindex = 10,
    }
    if opts.title then
        win_opts.title = " " .. opts.title .. " "
        win_opts.title_pos = opts.title_pos or "left"
    end
    if opts.footer then
        win_opts.footer = " " .. opts.footer .. " "
        win_opts.footer_pos = opts.footer_pos or "left"
    end
    local win = api.nvim_open_win(buf, false, win_opts)
    if opts.hl then
        vim.wo[win].winhighlight = "Normal:" .. opts.hl
            .. ",FloatBorder:CplineBorder"
            .. ",FloatTitle:CplineFloatTitle"
            .. ",FloatFooter:CplineFloatFooter"
    end
    vim.wo[win].wrap = false
    vim.wo[win].number = false
    vim.wo[win].relativenumber = false
    vim.wo[win].signcolumn = "no"
    vim.wo[win].cursorline = false
    vim.wo[win].list = false
    vim.wo[win].spell = false
    vim.wo[win].foldcolumn = "0"
    return win
end

local function scratch_buf(ft)
    local buf = api.nvim_create_buf(false, true)
    vim.bo[buf].buftype = "nofile"
    vim.bo[buf].bufhidden = "wipe"
    vim.bo[buf].swapfile = false
    if ft then vim.bo[buf].filetype = ft end
    return buf
end

local function status_builder()
    local lines, hls = {}, {}
    local function add(text, hl)
        insert(lines, text)
        if hl then insert(hls, { line = #lines - 1, group = hl }) end
    end
    return add, lines, hls
end

local function set_status_title(title)
    if M.layout and api.nvim_win_is_valid(M.layout.status_win) then
        api.nvim_win_set_config(M.layout.status_win, {
            title = title,
            title_pos = "center",
        })
    end
end

local function bar(pct, width)
    local filled = floor((pct / 100) * width + 0.5)
    filled = max(0, min(width, filled))
    return BAR_FILLED:rep(filled) .. BAR_EMPTY:rep(width - filled)
end

function M._format_tokens(n)
    if n >= 1000000 then return format("%.1fM", n / 1000000)
    elseif n >= 1000 then return format("%.1fK", n / 1000) end
    return tostring(n)
end

-- layout --

function M.open()
    if M.layout then return end

    local saved = save_and_set_globals()
    local geo = calc_geometry()

    local bg_buf = scratch_buf()
    vim.bo[bg_buf].modifiable = false
    local bg_win = api.nvim_open_win(bg_buf, true, {
        relative = "editor",
        row = 0, col = 0,
        width = geo.bg.width,
        height = geo.bg.height,
        style = "minimal",
        border = "none",
        zindex = 1,
    })
    vim.wo[bg_win].winhighlight = "Normal:CplineBg"

    local conv_buf = scratch_buf("markdown")
    vim.bo[conv_buf].modifiable = true
    local conv_win = open_float(conv_buf, geo.conv, { border = true, hl = "CplineConv" })
    vim.wo[conv_win].wrap = true
    vim.wo[conv_win].linebreak = true
    vim.wo[conv_win].cursorline = true
    vim.wo[conv_win].scrolloff = 4

    local status_buf = scratch_buf()
    vim.bo[status_buf].modifiable = false
    local status_win = open_float(status_buf, geo.status, { border = true, hl = "CplineStatus" })

    local input_buf = scratch_buf("markdown")
    local input_win = open_float(input_buf, geo.input, {
        border = true,
        hl = "CplineInput",
        title = "\u{25B8} prompt",
        footer = "ctrl-s send  ctrl-c cancel  ctrl-n new  ctrl-q quit",
        footer_pos = "right",
    })
    vim.wo[input_win].wrap = true

    M.layout = {
        conv_buf = conv_buf,
        conv_win = conv_win,
        input_buf = input_buf,
        input_win = input_win,
        status_buf = status_buf,
        status_win = status_win,
        bg_buf = bg_buf,
        bg_win = bg_win,
        saved_opts = saved,
        streaming = false,
    }

    M.update_status({})

    api.nvim_set_current_win(input_win)
    vim.cmd("startinsert")

    api.nvim_create_autocmd("VimResized", {
        group = api.nvim_create_augroup("cpline_resize", { clear = true }),
        callback = function() M._reposition() end,
    })
end

function M._reposition()
    if not M.layout then return end
    local geo = calc_geometry()

    local function reconf(win, g)
        if not api.nvim_win_is_valid(win) then return end
        api.nvim_win_set_config(win, {
            relative = "editor",
            row = g.row, col = g.col,
            width = max(1, g.width),
            height = max(1, g.height),
        })
    end

    if api.nvim_win_is_valid(M.layout.bg_win) then
        api.nvim_win_set_config(M.layout.bg_win, {
            relative = "editor",
            row = 0, col = 0,
            width = geo.bg.width,
            height = geo.bg.height,
        })
    end

    reconf(M.layout.conv_win, geo.conv)
    reconf(M.layout.status_win, geo.status)
    reconf(M.layout.input_win, geo.input)
end

function M.close()
    if not M.layout then return end

    local wins = { M.layout.input_win, M.layout.status_win, M.layout.conv_win, M.layout.bg_win }
    for i = 1, #wins do
        if api.nvim_win_is_valid(wins[i]) then
            api.nvim_win_close(wins[i], true)
        end
    end

    restore_globals(M.layout.saved_opts)
    pcall(api.nvim_del_augroup_by_name, "cpline_resize")
    M.layout = nil

    vim.cmd("qa!")
end

-- streaming --

function M.set_streaming(active)
    if not M.layout then return end
    M.layout.streaming = active
    if not active then
        vim.bo[M.layout.conv_buf].modifiable = false
    end
end

-- conversation --

function M.append_conv(text)
    if not M.layout then return end
    local buf = M.layout.conv_buf
    vim.bo[buf].modifiable = true
    local lines = vim.split(text, "\n", { plain = true })

    local line_count = api.nvim_buf_line_count(buf)
    local last_line = api.nvim_buf_get_lines(buf, line_count - 1, line_count, false)[1] or ""

    if last_line == "" and line_count == 1 then
        api.nvim_buf_set_lines(buf, 0, -1, false, lines)
    else
        api.nvim_buf_set_lines(buf, line_count - 1, line_count, false, { last_line .. lines[1] })
        if #lines > 1 then
            api.nvim_buf_set_lines(buf, -1, -1, false, vim.list_slice(lines, 2))
        end
    end

    if not M.layout.streaming then
        vim.bo[buf].modifiable = false
    end

    if api.nvim_win_is_valid(M.layout.conv_win) then
        local new_count = api.nvim_buf_line_count(buf)
        api.nvim_win_set_cursor(M.layout.conv_win, { new_count, 0 })
    end
end

function M.append_separator(label, hl_group)
    if not M.layout then return end
    local buf = M.layout.conv_buf
    vim.bo[buf].modifiable = true

    local line_count = api.nvim_buf_line_count(buf)
    local last_line = api.nvim_buf_get_lines(buf, line_count - 1, line_count, false)[1] or ""

    local sep_lines = {}
    if last_line ~= "" then insert(sep_lines, "") end
    insert(sep_lines, label)
    insert(sep_lines, "")

    api.nvim_buf_set_lines(buf, -1, -1, false, sep_lines)

    if hl_group then
        local new_count = api.nvim_buf_line_count(buf)
        api.nvim_buf_add_highlight(buf, NS, hl_group, new_count - 2, 0, -1)
    end

    if not M.layout.streaming then
        vim.bo[buf].modifiable = false
    end
end

function M.consume_input()
    if not M.layout then return nil end
    local buf = M.layout.input_buf
    local lines = api.nvim_buf_get_lines(buf, 0, -1, false)
    local text = vim.fn.trim(table.concat(lines, "\n"))
    if text == "" then return nil end
    api.nvim_buf_set_lines(buf, 0, -1, false, { "" })
    return text
end

function M.clear_conv()
    if not M.layout then return end
    local buf = M.layout.conv_buf
    vim.bo[buf].modifiable = true
    api.nvim_buf_set_lines(buf, 0, -1, false, { "" })
    vim.bo[buf].modifiable = false
end

function M.focus_input()
    if not M.layout then return end
    if api.nvim_win_is_valid(M.layout.input_win) then
        api.nvim_set_current_win(M.layout.input_win)
        vim.cmd("startinsert")
    end
end

-- status --

function M._set_status_lines(lines, highlights)
    if not M.layout then return end
    local buf = M.layout.status_buf
    vim.bo[buf].modifiable = true
    api.nvim_buf_set_lines(buf, 0, -1, false, lines)
    api.nvim_buf_clear_namespace(buf, NS, 0, -1)
    if highlights then
        for i = 1, #highlights do
            local hl = highlights[i]
            api.nvim_buf_add_highlight(buf, NS, hl.group, hl.line, hl.col_start or 0, hl.col_end or -1)
        end
    end
    vim.bo[buf].modifiable = false
end

function M.update_status(data)
    local add, lines, hls = status_builder()
    local bar_w = STATUS_WIDTH - 6

    local status = data.status or "ready"
    local status_hl = "CplineReady"
    if status == "streaming..." or status == "thinking..." then
        status_hl = "CplineActive"
    elseif status == "error" or status == "cancelled" then
        status_hl = "CplineError"
    end

    add("")
    add("  SESSION", "CplineLabel")
    add("  " .. status, status_hl)
    if data.cost then
        add(format("  $%.4f", data.cost), "CplineMuted")
    end
    if data.tokens_in and data.tokens_out then
        add(format("  %s in  %s out", M._format_tokens(data.tokens_in), M._format_tokens(data.tokens_out)), "CplineMuted")
    end

    add("")
    add("  CONTEXT", "CplineLabel")
    if data.context_pct then
        add("  " .. bar(data.context_pct, bar_w), "CplineBar")
        add(format("  %d%%  %s/%s", data.context_pct, M._format_tokens(data.context_used or 0), M._format_tokens(data.context_max or 0)), "CplineMuted")
    else
        add("  --", "CplineMuted")
    end

    add("")
    add("  BLOCK", "CplineLabel")
    if data.block_pct then
        local bhl = "CplineBar"
        if data.block_pct >= 80 then bhl = "CplineError"
        elseif data.block_pct >= 50 then bhl = "CplineWarning" end
        add("  " .. bar(data.block_pct, bar_w), bhl)
        local info = format("  %d%%", data.block_pct)
        if data.block_time then info = info .. "  " .. data.block_time end
        add(info, "CplineMuted")
    else
        add("  --", "CplineMuted")
    end

    add("")
    add("  GIT", "CplineLabel")
    if data.git_branch then
        add("  \u{2387} " .. data.git_branch .. " " .. (data.git_status or ""), "CplineMuted")
    else
        add("  --", "CplineMuted")
    end

    M._set_status_lines(lines, hls)

    local title = " cpline "
    if data.model then title = " \u{25C7} " .. data.model .. " " end
    set_status_title(title)
end

return M
