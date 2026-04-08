local uv = vim.uv or vim.loop

local M = {}

-- aliases --

local insert = table.insert
local schedule = vim.schedule
local json_decode = vim.json.decode
local split = vim.split

-- constants --

local SPLIT_OPTS = { plain = true }

-- state --

M.state = {
    session_id = nil,
    proc = nil,
    running = false,
    partial_line = "",
}

local cached_env = nil

-- helpers --

local function parse_line(line)
    if line == "" then return nil end
    local ok, event = pcall(json_decode, line)
    if not ok then return nil end
    return event
end

local function build_args(prompt, opts)
    opts = opts or {}
    local args = {
        "-p", prompt,
        "--output-format", "stream-json",
        "--verbose",
    }

    if M.state.session_id then
        insert(args, "--resume")
        insert(args, M.state.session_id)
    end

    if opts.model then
        insert(args, "--model")
        insert(args, opts.model)
    end

    if opts.max_turns then
        insert(args, "--max-turns")
        insert(args, tostring(opts.max_turns))
    end

    return args
end

local function get_env()
    if cached_env then return cached_env end
    local env = {}
    for k, v in pairs(uv.os_environ()) do
        if not k:match("^CLAUDECODE") and not k:match("^CLAUDE_CODE_ENTRYPOINT") then
            insert(env, k .. "=" .. v)
        end
    end
    cached_env = env
    return env
end

-- public --

function M.send(prompt, callbacks, opts)
    if M.state.running then
        if callbacks.on_error then
            callbacks.on_error("Already running a request")
        end
        return
    end

    local stdout = uv.new_pipe(false)
    local stderr = uv.new_pipe(false)
    local args = build_args(prompt, opts)

    M.state.running = true
    M.state.partial_line = ""

    local handle, err_msg = uv.spawn("claude", {
        args = args,
        stdio = { nil, stdout, stderr },
        env = get_env(),
    }, function(code)
        M.state.running = false
        M.state.proc = nil
        pcall(function() stdout:close() end)
        pcall(function() stderr:close() end)
        schedule(function()
            if callbacks.on_exit then callbacks.on_exit(code) end
        end)
    end)

    if not handle then
        M.state.running = false
        if callbacks.on_error then
            callbacks.on_error("Failed to spawn claude: " .. (err_msg or "not found in PATH"))
        end
        return
    end

    M.state.proc = handle

    stdout:read_start(function(err, data)
        if err then
            schedule(function()
                if callbacks.on_error then callbacks.on_error(err) end
            end)
            return
        end
        if not data then return end

        local buf = M.state.partial_line .. data
        local lines = split(buf, "\n", SPLIT_OPTS)
        M.state.partial_line = table.remove(lines) or ""

        local events = {}
        for i = 1, #lines do
            local event = parse_line(lines[i])
            if event then events[#events + 1] = event end
        end
        if #events > 0 then
            schedule(function()
                for i = 1, #events do
                    M._dispatch(events[i], callbacks)
                end
            end)
        end
    end)

    stderr:read_start(function(_, data)
        if data then
            schedule(function()
                if callbacks.on_error then callbacks.on_error(data) end
            end)
        end
    end)
end

function M._dispatch(event, callbacks)
    local t = event.type

    if t == "system" then
        M.state.session_id = event.session_id
        if callbacks.on_init then callbacks.on_init(event) end

    elseif t == "assistant" then
        local msg = event.message
        if type(msg) == "string" then
            if callbacks.on_text then callbacks.on_text(msg) end
        elseif type(msg) == "table" then
            local content = msg.content
            if type(content) == "table" then
                for i = 1, #content do
                    local block = content[i]
                    if block.type == "text" and callbacks.on_text then
                        callbacks.on_text(block.text)
                    elseif block.type == "tool_use" and callbacks.on_tool_use then
                        callbacks.on_tool_use(block)
                    end
                end
            elseif type(content) == "string" and callbacks.on_text then
                callbacks.on_text(content)
            end
        end

    elseif t == "user" then
        local msg = event.message
        if type(msg) == "table" and type(msg.content) == "table" then
            local content = msg.content
            for i = 1, #content do
                if content[i].type == "tool_result" and callbacks.on_tool_result then
                    callbacks.on_tool_result(content[i])
                end
            end
        end

    elseif t == "result" then
        if callbacks.on_result then callbacks.on_result(event) end

    elseif t == "error" then
        if callbacks.on_error then
            callbacks.on_error(event.error or "Unknown error")
        end
    end
end

function M.cancel()
    if M.state.proc and M.state.running then
        M.state.proc:kill("sigterm")
        vim.defer_fn(function()
            if M.state.proc and M.state.running then
                M.state.proc:kill("sigkill")
            end
        end, 5000)
    end
end

function M.reset_session()
    M.state.session_id = nil
end

return M
