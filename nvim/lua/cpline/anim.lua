local M = {}

-- aliases --

local api = vim.api
local floor = math.floor

-- constants --

local NS = api.nvim_create_namespace("cpline_anim")

local SPINNERS = {
    thinking = {
        frames = {
            "\u{2801}", "\u{2804}", "\u{2802}", "\u{2801}", "\u{2808}", "\u{2810}", "\u{2820}", "\u{2840}",
            "\u{2880}", "\u{2840}", "\u{2820}", "\u{2810}", "\u{2808}", "\u{2801}", "\u{2802}", "\u{2804}",
        },
        interval = 120,
    },
    streaming = {
        frames = {
            "\u{2801}", "\u{2804}", "\u{2802}", "\u{2801}", "\u{2808}", "\u{2810}", "\u{2820}", "\u{2840}",
            "\u{28C0}", "\u{2844}", "\u{2842}", "\u{2841}", "\u{2848}", "\u{2850}", "\u{2860}", "\u{28E0}",
            "\u{2864}", "\u{2862}", "\u{2861}", "\u{2868}", "\u{2870}", "\u{28F0}", "\u{2874}", "\u{2872}",
            "\u{2871}", "\u{2878}", "\u{28F8}", "\u{287C}", "\u{287A}", "\u{2879}", "\u{28F9}", "\u{287D}",
            "\u{287B}", "\u{28FB}", "\u{287F}", "\u{28FF}",
        },
        interval = 80,
    },
    tool = {
        frames = { "\u{00B7}", "\u{2722}", "\u{2733}", "\u{2217}", "\u{273B}", "\u{273D}" },
        interval = 200,
    },
}

-- state --

M._active = {}

-- helpers --

local function render_frame(id)
    local anim = M._active[id]
    if not anim then return end
    if not api.nvim_buf_is_valid(anim.buf) then
        M.stop(id)
        return
    end

    local spinner = SPINNERS[anim.style] or SPINNERS.thinking
    local char = spinner.frames[anim.frame]
    anim.frame = (anim.frame % #spinner.frames) + 1

    local display = char .. " " .. anim.label

    local win = vim.fn.bufwinid(anim.buf)
    local virt_text = { { display, anim.hl or "CplineActive" } }
    if win ~= -1 and api.nvim_win_is_valid(win) then
        local win_width = api.nvim_win_get_width(win)
        local text_width = vim.fn.strdisplaywidth(display)
        if win_width > text_width then
            local padding = floor((win_width - text_width) / 2)
            table.insert(virt_text, 1, { string.rep(" ", padding), "Normal" })
        end
    end

    local line_count = api.nvim_buf_line_count(anim.buf)
    local target_line = line_count - 1
    if target_line < 0 then target_line = 0 end

    anim.extmark = api.nvim_buf_set_extmark(anim.buf, NS, target_line, 0, {
        id = anim.extmark,
        virt_lines = {
            { { "" } },
            virt_text,
            { { "" } },
        },
        virt_lines_above = false,
    })

    anim.timer = vim.defer_fn(function()
        render_frame(id)
    end, spinner.interval)
end

-- public --

function M.start(buf, style, label, hl)
    local id = buf
    M.stop(id)

    M._active[id] = {
        buf = buf,
        style = style or "thinking",
        label = label or "",
        hl = hl,
        frame = 1,
        extmark = nil,
        timer = nil,
    }

    render_frame(id)
    return id
end

function M.stop(id)
    local anim = M._active[id]
    if not anim then return end

    if anim.extmark and api.nvim_buf_is_valid(anim.buf) then
        pcall(api.nvim_buf_del_extmark, anim.buf, NS, anim.extmark)
    end

    M._active[id] = nil
end

function M.stop_all()
    for id in pairs(M._active) do
        M.stop(id)
    end
end

return M
