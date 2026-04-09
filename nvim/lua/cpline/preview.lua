local layout = require("cpline.layout")

local M = {}

-- aliases --

local api = vim.api
local format = string.format
local max = math.max
local min = math.min
local floor = math.floor
local split = vim.split

-- constants --

local NS = api.nvim_create_namespace("cpline_preview")
local SPLIT_OPTS = { plain = true }

-- state --

M._win = nil
M._buf = nil

-- helpers --

local function set_conv_dim(active)
    local l = layout.layout
    if not l or not api.nvim_win_is_valid(l.conv_win) then return end
    if active then
        vim.wo[l.conv_win].winblend = 30
    else
        vim.wo[l.conv_win].winblend = 0
    end
end

local function close_preview()
    if M._win and api.nvim_win_is_valid(M._win) then
        api.nvim_win_close(M._win, true)
    end
    set_conv_dim(false)
    M._win = nil
    M._buf = nil
end

local function calc_preview_geo(conv_geo, line_count)
    local w = conv_geo.width - 4
    local h = min(line_count + 2, conv_geo.height - 4)
    h = max(h, 3)
    local row = conv_geo.row + floor((conv_geo.height - h) / 2)
    local col = conv_geo.col + 2
    return { row = row, col = col, width = w, height = h }
end

local function basename(path)
    return path:match("([^/]+)$") or path
end

local function show_float(lines, highlights, opts)
    close_preview()

    local conv_geo = layout.calc_geometry().conv
    local geo = calc_preview_geo(conv_geo, #lines)

    local buf = layout.scratch_buf(opts.ft)
    vim.bo[buf].modifiable = true
    api.nvim_buf_set_lines(buf, 0, -1, false, lines)

    if highlights then
        for i = 1, #highlights do
            local hl = highlights[i]
            api.nvim_buf_add_highlight(buf, NS, hl.group, hl.line, 0, -1)
        end
    end

    vim.bo[buf].modifiable = false

    M._buf = buf
    M._win = layout.open_float(buf, geo, {
        border = true,
        hl = "CplinePreview",
        title = opts.title,
        title_pos = "left",
        zindex = 20,
    })
    vim.wo[M._win].winblend = 10
    set_conv_dim(true)

    vim.keymap.set("n", "q", close_preview, { buffer = buf, nowait = true })
    vim.keymap.set("n", "<Esc>", close_preview, { buffer = buf, nowait = true })
end

-- diff --

local function build_diff_lines(old_string, new_string)
    local old_lines = split(old_string, "\n", SPLIT_OPTS)
    local new_lines = split(new_string, "\n", SPLIT_OPTS)
    local hunks = vim.diff(old_string, new_string, {
        result_type = "indices",
        algorithm = "histogram",
    })

    local lines, highlights = {}, {}
    local old_cursor = 1

    local function add(text, group)
        lines[#lines + 1] = text
        if group then highlights[#highlights + 1] = { line = #lines - 1, group = group } end
    end

    for i = 1, #hunks do
        local old_start, old_count, new_start, new_count = hunks[i][1], hunks[i][2], hunks[i][3], hunks[i][4]

        for j = old_cursor, old_start - 1 do
            add("  " .. old_lines[j])
        end

        for j = old_start, old_start + old_count - 1 do
            add("- " .. old_lines[j], "CplineDiffDel")
        end

        for j = new_start, new_start + new_count - 1 do
            add("+ " .. new_lines[j], "CplineDiffAdd")
        end

        old_cursor = old_start + old_count
    end

    for j = old_cursor, #old_lines do
        add("  " .. old_lines[j])
    end

    return lines, highlights
end

-- public --

function M.show_edit(input)
    if not input.file_path or not input.old_string or not input.new_string then return end

    local lines, highlights = build_diff_lines(input.old_string, input.new_string)
    if not lines or #lines == 0 then return end

    show_float(lines, highlights, {
        title = basename(input.file_path),
    })
end

function M.show_write(input)
    if not input.file_path or not input.content then return end

    local content_lines = split(input.content, "\n", SPLIT_OPTS)
    local geo = layout.calc_geometry().conv
    local max_lines = geo.height - 6

    local truncated = false
    if #content_lines > max_lines then
        local remaining = #content_lines - max_lines
        content_lines = vim.list_slice(content_lines, 1, max_lines)
        content_lines[#content_lines + 1] = format("... (%d more lines)", remaining)
        truncated = true
    end

    local ft = vim.filetype.match({ filename = input.file_path })

    local highlights = nil
    if truncated then
        highlights = { { line = #content_lines - 1, group = "CplineMuted" } }
    end

    show_float(content_lines, highlights, {
        title = basename(input.file_path),
        ft = ft,
    })
end

function M.dismiss()
    close_preview()
end

function M.is_open()
    return M._win ~= nil and api.nvim_win_is_valid(M._win)
end

function M.reposition()
    if not M.is_open() then return end
    local conv_geo = layout.calc_geometry().conv
    local line_count = api.nvim_buf_line_count(M._buf)
    local geo = calc_preview_geo(conv_geo, line_count)
    api.nvim_win_set_config(M._win, {
        relative = "editor",
        row = geo.row,
        col = geo.col,
        width = max(1, geo.width),
        height = max(1, geo.height),
    })
end

return M
