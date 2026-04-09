local session = require("cpline.session")
local layout = require("cpline.layout")

local M = {}

-- aliases --

local fn = vim.fn
local json_decode = vim.json.decode
local format = string.format

-- helpers --

local function encode_path(path)
    path = path:gsub("/$", "")
    return path:gsub("/", "-")
end

local function read_index()
    local cwd = fn.getcwd()
    local encoded = encode_path(cwd)
    local index_path = fn.expand("~/.claude/projects/" .. encoded .. "/sessions-index.json")

    local fd = io.open(index_path, "r")
    if not fd then return nil end
    local content = fd:read("*a")
    fd:close()

    local ok, data = pcall(json_decode, content)
    if not ok or not data or not data.entries then return nil end

    return data.entries
end

local function format_date(iso)
    if not iso then return "?" end
    return iso:sub(1, 10)
end

local function format_entry(entry)
    local date = format_date(entry.modified or entry.created)
    local count = entry.messageCount or 0
    local prompt = entry.firstPrompt or ""
    if #prompt > 60 then prompt = prompt:sub(1, 60) .. "..." end
    prompt = prompt:gsub("\n", " ")
    return format("%s  %3dmsg  %s", date, count, prompt)
end

-- public --

function M.open()
    local entries = read_index()
    if not entries or #entries == 0 then
        vim.notify("No sessions found for this project")
        return
    end

    table.sort(entries, function(a, b)
        return (a.modified or a.created or "") > (b.modified or b.created or "")
    end)

    local items = {}
    for i = 1, #entries do
        items[i] = {
            text = format_entry(entries[i]),
            entry = entries[i],
        }
    end

    local ok, pick = pcall(require, "mini.pick")
    if not ok then
        vim.notify("mini.pick not available")
        return
    end

    pick.start({
        source = {
            name = "Claude Sessions",
            items = items,
            choose = function(item)
                if not item or not item.entry then return end
                local entry = item.entry

                local label = entry.firstPrompt or "Resumed"
                if #label > 30 then label = label:sub(1, 30) .. "..." end
                label = label:gsub("\n", " ")

                local sess = session.create({
                    label = label,
                    session_id = entry.sessionId,
                })

                session.switch(session.count())
                layout.swap_conv_buf(sess.conv_buf)

                local cpline = require("cpline")
                cpline._setup_conv_keymaps(sess.conv_buf)
                cpline._refresh()
                layout.focus_input()
            end,
        },
    })
end

return M
