local layout = require("cpline.layout")

local M = {}

-- aliases --

local api = vim.api

-- state --

M.sessions = {}
M.current = nil
M.next_id = 1

-- helpers --

local function default_state()
    return {
        model = nil,
        session_id = nil,
        total_cost = 0,
        total_tokens_in = 0,
        total_tokens_out = 0,
        cache_creation = 0,
        cache_read = 0,
        last_input_tokens = 0,
        lines_added = 0,
        lines_removed = 0,
        message_count = 0,
        last_send_time = nil,
        last_response_ms = nil,
    }
end

local function default_backend()
    return {
        session_id = nil,
        proc = nil,
        running = false,
        partial_line = "",
    }
end

local function make_label(id)
    return "Session " .. id
end

-- public --

function M.create(opts)
    opts = opts or {}
    local id = M.next_id
    M.next_id = M.next_id + 1

    local conv_buf = layout.scratch_buf("markdown", true)
    vim.bo[conv_buf].buflisted = true
    vim.bo[conv_buf].modifiable = true
    local label = opts.label or make_label(id)
    api.nvim_buf_set_name(conv_buf, label)

    local sess = {
        id = id,
        label = label,
        conv_buf = conv_buf,
        backend = default_backend(),
        state = default_state(),
        mode = "plan",
        effort = "auto",
        model_override = nil,
        attachments = {},
    }

    if opts.session_id then
        sess.backend.session_id = opts.session_id
        sess.state.session_id = opts.session_id
    end

    M.sessions[#M.sessions + 1] = sess

    if not M.current then
        M.current = #M.sessions
    end

    return sess
end

function M.switch(idx)
    if idx < 1 or idx > #M.sessions then return end
    M.current = idx
end

function M.close(idx)
    idx = idx or M.current
    if not idx or idx < 1 or idx > #M.sessions then return end

    local sess = M.sessions[idx]

    if sess.conv_buf and api.nvim_buf_is_valid(sess.conv_buf) then
        api.nvim_buf_delete(sess.conv_buf, { force = true })
    end

    table.remove(M.sessions, idx)

    if #M.sessions == 0 then
        M.current = nil
    elseif M.current > #M.sessions then
        M.current = #M.sessions
    end
end

function M.get()
    if not M.current then return nil end
    return M.sessions[M.current]
end

function M.count()
    return #M.sessions
end

function M.index_of(sess)
    for i = 1, #M.sessions do
        if M.sessions[i] == sess then return i end
    end
    return nil
end

function M.find_by_buf(buf_id)
    for i = 1, #M.sessions do
        if M.sessions[i].conv_buf == buf_id then return i end
    end
    return nil
end

function M.set_label(idx, label)
    local sess = M.sessions[idx]
    if not sess then return end
    sess.label = label
    if api.nvim_buf_is_valid(sess.conv_buf) then
        api.nvim_buf_set_name(sess.conv_buf, label)
    end
end

return M
