local M = {}

-- aliases --

local api = vim.api
local insert = table.insert
local format = string.format
local floor = math.floor
local max = math.max
local min = math.min
local rep = string.rep

-- constants --

local NS = api.nvim_create_namespace("cpline")
local STATUS_WIDTH = 28
local INPUT_HEIGHT = 3
local BAR_FILLED = "\u{25AA}"
local BAR_EMPTY = "\u{25AB}"
local DIVIDER = "\u{2500}"
local BORDER = { "\u{256D}", "\u{2500}", "\u{256E}", "\u{2502}", "\u{256F}", "\u{2500}", "\u{2570}", "\u{2502}" }

local KEYBIND_HINTS = " tab mode  ctrl-t effort  ctrl-p ... "

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
        equalalways = vim.o.equalalways,
        mouse = vim.o.mouse,
    }
    vim.o.laststatus = 2
    vim.o.showtabline = 2
    vim.o.showmode = false
    vim.o.cmdheight = 0
    vim.o.ruler = false
    vim.o.fillchars = "eob: "
    vim.o.equalalways = false
    vim.o.mouse = "a"
    return saved
end

local function restore_globals(saved)
    for k, v in pairs(saved) do
        vim.o[k] = v
    end
end

local function setup_win(win, opts)
    vim.wo[win].wrap = opts.wrap or false
    vim.wo[win].linebreak = opts.wrap or false
    vim.wo[win].number = false
    vim.wo[win].relativenumber = false
    vim.wo[win].signcolumn = "no"
    vim.wo[win].cursorline = opts.cursorline or false
    vim.wo[win].list = false
    vim.wo[win].spell = false
    vim.wo[win].foldcolumn = "0"
    if opts.scrolloff then vim.wo[win].scrolloff = opts.scrolloff end
    if opts.hl then vim.wo[win].winhighlight = "Normal:" .. opts.hl .. ",WinBar:CplineWinbar,WinBarNC:CplineWinbarNC" end
    if opts.fixwidth then vim.wo[win].winfixwidth = true end
    if opts.fixheight then vim.wo[win].winfixheight = true end
end

local function escape_winbar(s)
    return s:gsub("%%", "%%%%")
end

local function calc_geometry()
    if M.layout then
        local function win_geo(win)
            if not api.nvim_win_is_valid(win) then return { row = 0, col = 0, width = 1, height = 1 } end
            local pos = api.nvim_win_get_position(win)
            return {
                row = pos[1],
                col = pos[2],
                width = api.nvim_win_get_width(win),
                height = api.nvim_win_get_height(win),
            }
        end
        return {
            conv = win_geo(M.layout.conv_win),
            status = win_geo(M.layout.status_win),
            input = win_geo(M.layout.input_win),
        }
    end

    local ew = vim.o.columns
    local eh = vim.o.lines - 2
    local conv_w = ew - STATUS_WIDTH - 1
    local conv_h = eh - INPUT_HEIGHT - 1
    return {
        conv   = { row = 0, col = 0, width = conv_w, height = conv_h },
        status = { row = 0, col = conv_w + 1, width = STATUS_WIDTH, height = conv_h },
        input  = { row = conv_h + 1, col = 0, width = ew, height = INPUT_HEIGHT },
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
        zindex = opts.zindex or 10,
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

local function scratch_buf(ft, persist)
    local buf = api.nvim_create_buf(false, true)
    vim.bo[buf].buftype = "nofile"
    vim.bo[buf].bufhidden = persist and "hide" or "wipe"
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
        vim.wo[M.layout.status_win].winbar = "%#CplineWinbar#%=" .. escape_winbar(title) .. "%="
    end
end

local function bar(pct, width)
    local filled = floor((pct / 100) * width + 0.5)
    filled = max(0, min(width, filled))
    return BAR_FILLED:rep(filled) .. BAR_EMPTY:rep(width - filled)
end

local function divider(width)
    return " " .. rep(DIVIDER, max(1, width - 2))
end

function M.format_tokens(n)
    if n >= 1000000 then return format("%.1fM", n / 1000000)
    elseif n >= 1000 then return format("%.1fK", n / 1000) end
    return tostring(n)
end

local cached_git = { info = "--", time = 0 }

function M._get_git_info()
    local now = vim.uv.now()
    if now - cached_git.time < 5000 then return cached_git.info end
    cached_git.time = now

    local branch = vim.fn.system("git rev-parse --abbrev-ref HEAD 2>/dev/null"):gsub("\n", "")
    if branch == "" or branch:match("^fatal") then
        cached_git.info = "--"
        return cached_git.info
    end

    local status = vim.fn.system("git status --porcelain 2>/dev/null")
    local dirty = (status ~= "" and status ~= nil)

    cached_git.info = format("\u{2387} %s %s", branch, dirty and "\u{25CF}" or "\u{2713}")
    return cached_git.info
end

-- shared helpers --

M.calc_geometry = calc_geometry
M.scratch_buf = scratch_buf
M.open_float = open_float

-- layout --

function M.open(conv_buf)
    if M.layout then return end

    local saved = save_and_set_globals()

    if not conv_buf then
        conv_buf = scratch_buf("markdown", true)
    end
    vim.bo[conv_buf].modifiable = true

    local status_buf = scratch_buf()
    vim.bo[status_buf].modifiable = false

    local input_buf = scratch_buf("markdown")

    local conv_win = api.nvim_get_current_win()
    api.nvim_win_set_buf(conv_win, conv_buf)

    vim.cmd("botright split")
    local input_win = api.nvim_get_current_win()
    api.nvim_win_set_buf(input_win, input_buf)
    api.nvim_win_set_height(input_win, INPUT_HEIGHT)

    api.nvim_set_current_win(conv_win)
    vim.cmd("rightbelow vsplit")
    local status_win = api.nvim_get_current_win()
    api.nvim_win_set_buf(status_win, status_buf)
    api.nvim_win_set_width(status_win, STATUS_WIDTH)

    setup_win(conv_win, { wrap = true, cursorline = true, scrolloff = 4, hl = "CplineConv" })
    setup_win(status_win, { hl = "CplineStatus", fixwidth = true })
    vim.wo[status_win].winblend = 5
    setup_win(input_win, { wrap = true, hl = "CplineInput", fixheight = true })

    vim.wo[conv_win].statusline = " "
    vim.wo[status_win].statusline = " "
    vim.wo[input_win].statusline = "%#CplineFloatFooter#%=" .. KEYBIND_HINTS

    vim.wo[input_win].winfixbuf = true
    vim.wo[status_win].winfixbuf = true

    M.layout = {
        conv_buf = conv_buf,
        conv_win = conv_win,
        input_buf = input_buf,
        input_win = input_win,
        status_buf = status_buf,
        status_win = status_win,
        saved_opts = saved,
        streaming = false,
    }

    M.update_status({})
    M.update_input_title("plan")

    api.nvim_set_current_win(input_win)
    vim.cmd("startinsert")

    api.nvim_create_autocmd("VimResized", {
        group = api.nvim_create_augroup("cpline_resize", { clear = true }),
        callback = function() M._reposition() end,
    })
end

function M._reposition()
    if not M.layout then return end

    if api.nvim_win_is_valid(M.layout.status_win) then
        api.nvim_win_set_width(M.layout.status_win, STATUS_WIDTH)
    end
    if api.nvim_win_is_valid(M.layout.input_win) then
        api.nvim_win_set_height(M.layout.input_win, INPUT_HEIGHT)
    end

    local preview = require("cpline.preview")
    if preview.is_open() then preview.reposition() end
end

function M.close()
    if not M.layout then return end
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

function M.consume_input()
    if not M.layout then return nil end
    local buf = M.layout.input_buf
    local lines = api.nvim_buf_get_lines(buf, 0, -1, false)
    local text = vim.fn.trim(table.concat(lines, "\n"))
    if text == "" then return nil end
    api.nvim_buf_set_lines(buf, 0, -1, false, { "" })
    return text
end

function M.focus_input()
    if not M.layout then return end
    if api.nvim_win_is_valid(M.layout.input_win) then
        api.nvim_set_current_win(M.layout.input_win)
        vim.cmd("startinsert")
    end
end

function M.update_input_title(mode, effort)
    if not M.layout then return end
    if api.nvim_win_is_valid(M.layout.input_win) then
        local mode_label = mode == "exec" and "exec" or "plan"
        local effort_label = effort or "auto"
        local label = format("\u{25B8} %s \u{00B7} %s", mode_label, effort_label)
        vim.wo[M.layout.input_win].winbar = "%#CplineWinbar# " .. label .. " "
    end
end

function M.swap_conv_buf(buf)
    if not M.layout then return end
    if api.nvim_win_is_valid(M.layout.conv_win) then
        api.nvim_win_set_buf(M.layout.conv_win, buf)
        M.layout.conv_buf = buf
        local line_count = api.nvim_buf_line_count(buf)
        api.nvim_win_set_cursor(M.layout.conv_win, { line_count, 0 })
    end
end

function M.append_to_buf(buf, text)
    if not api.nvim_buf_is_valid(buf) then return end
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
end

function M.separator_to_buf(buf, label, hl_group)
    if not api.nvim_buf_is_valid(buf) then return end
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
end

function M.add_right_hint(buf, line, text, hl)
    if not api.nvim_buf_is_valid(buf) then return end
    api.nvim_buf_set_extmark(buf, NS, line, 0, {
        virt_text = { { text, hl or "CplineMuted" } },
        virt_text_pos = "right_align",
    })
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
    local status_hl = "CplineStatusReady"
    if status == "streaming..." or status == "thinking..." then
        status_hl = "CplineStatusActive"
    elseif status == "error" or status == "cancelled" then
        status_hl = "CplineStatusError"
    end

    add("")
    add("  " .. status, status_hl)

    add(divider(STATUS_WIDTH), "CplineBorder")

    add("  SESSION", "CplineGrad1")
    if data.cost then
        add(format("  \u{00A7} $%.4f", data.cost), "CplineMuted")
    end
    if data.tokens_in and data.tokens_out then
        add(format("  %s in \u{00B7} %s out", M.format_tokens(data.tokens_in), M.format_tokens(data.tokens_out)), "CplineMuted")
        if data.cache_read then
            add(format("  %s cached", M.format_tokens(data.cache_read)), "CplineMuted")
        end
    end
    if data.messages then
        add(format("  \u{25C6} %d messages", data.messages), "CplineMuted")
    end

    add(divider(STATUS_WIDTH), "CplineBorder")

    add("  CONTEXT", "CplineGrad2")
    if data.context_pct then
        local ctx_hl = "CplineBar"
        if data.context_pct >= 80 then ctx_hl = "CplineError"
        elseif data.context_pct >= 50 then ctx_hl = "CplineWarning" end
        add("  " .. bar(data.context_pct, bar_w), ctx_hl)
        add(format("  %d%% \u{00B7} %s/%s", data.context_pct, M.format_tokens(data.context_used or 0), M.format_tokens(data.context_max or 0)), "CplineMuted")
    elseif data.context_used then
        add(format("  \u{25D4} %s tokens", M.format_tokens(data.context_used)), "CplineMuted")
    else
        add("  --", "CplineMuted")
    end

    add(divider(STATUS_WIDTH), "CplineBorder")

    add("  METRICS", "CplineGrad3")
    local metrics = {}
    if data.response_ms then
        if data.response_ms >= 60000 then
            metrics[#metrics + 1] = format("\u{2996} %.1fm", data.response_ms / 60000)
        else
            metrics[#metrics + 1] = format("\u{2996} %.1fs", data.response_ms / 1000)
        end
    end
    if data.lines_added or data.lines_removed then
        metrics[#metrics + 1] = format("+%d -%d", data.lines_added or 0, data.lines_removed or 0)
    end
    if #metrics > 0 then
        add("  " .. table.concat(metrics, " \u{00B7} "), "CplineMuted")
    else
        add("  --", "CplineMuted")
    end

    add(divider(STATUS_WIDTH), "CplineBorder")

    add("  GIT", "CplineGrad4")
    add("  " .. M._get_git_info(), "CplineMuted")

    M._set_status_lines(lines, hls)

    local title = " cpline "
    if data.model then title = " \u{2731} " .. data.model .. " " end
    set_status_title(title)
end

return M
