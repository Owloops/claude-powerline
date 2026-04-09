local uv = vim.uv or vim.loop

local M = {}

-- aliases --

local insert = table.insert
local schedule = vim.schedule
local json_decode = vim.json.decode
local split = vim.split

-- constants --

local SPLIT_OPTS = { plain = true }
local SENSITIVE_PATTERN = "KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL"
local DEFAULT_TIMEOUT_MS = 300000

-- helpers --

local cached_env = nil

local function parse_line(line)
    if line == "" then return nil end
    local ok, event = pcall(json_decode, line)
    if not ok then return nil end
    return event
end

local function build_args(bstate, prompt, opts)
    opts = opts or {}
    local args = {
        "-p", prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        "--disable-slash-commands",
    }

    if bstate.session_id then
        insert(args, "--resume")
        insert(args, bstate.session_id)
    end

    if opts.model then
        insert(args, "--model")
        insert(args, opts.model)
    end

    if opts.fallback_model then
        insert(args, "--fallback-model")
        insert(args, opts.fallback_model)
    end

    if opts.max_turns then
        insert(args, "--max-turns")
        insert(args, tostring(opts.max_turns))
    end

    if opts.max_budget_usd then
        insert(args, "--max-budget-usd")
        insert(args, tostring(opts.max_budget_usd))
    end

    if opts.system_prompt then
        insert(args, "--append-system-prompt")
        insert(args, opts.system_prompt)
    end

    return args
end

local function get_env()
    if cached_env then return cached_env end
    local env = {}
    for k, v in pairs(uv.os_environ()) do
        if k:match("^CLAUDECODE") or k:match("^CLAUDE_CODE_ENTRYPOINT") then
            goto continue
        end
        if k:upper():match(SENSITIVE_PATTERN) and not k:match("^ANTHROPIC_API_KEY$") then
            goto continue
        end
        insert(env, k .. "=" .. v)
        ::continue::
    end
    cached_env = env
    return env
end

-- public --

function M.send(bstate, prompt, callbacks, opts)
    if bstate.running then
        if callbacks.on_error then
            callbacks.on_error("Already running a request")
        end
        return
    end

    local stdout = uv.new_pipe(false)
    local stderr = uv.new_pipe(false)
    local args = build_args(bstate, prompt, opts)

    bstate.running = true
    bstate.partial_line = ""
    bstate.active_tools = {}

    local timeout_ms = (opts and opts.timeout_ms) or DEFAULT_TIMEOUT_MS
    local timeout_timer = nil

    local function cleanup()
        if timeout_timer then
            timeout_timer:stop()
            timeout_timer:close()
            timeout_timer = nil
        end
    end

    local handle, err_msg = uv.spawn("claude", {
        args = args,
        stdio = { nil, stdout, stderr },
        env = get_env(),
    }, function(code)
        cleanup()
        bstate.running = false
        bstate.proc = nil
        pcall(function() stdout:close() end)
        pcall(function() stderr:close() end)
        schedule(function()
            M._mark_stale_tools(bstate, callbacks)
            if callbacks.on_exit then callbacks.on_exit(code) end
        end)
    end)

    if not handle then
        cleanup()
        bstate.running = false
        if callbacks.on_error then
            callbacks.on_error("Failed to spawn claude: " .. (err_msg or "not found in PATH"))
        end
        return
    end

    bstate.proc = handle

    timeout_timer = uv.new_timer()
    timeout_timer:start(timeout_ms, 0, function()
        cleanup()
        schedule(function()
            if callbacks.on_error then
                callbacks.on_error("Process timed out after " .. math.floor(timeout_ms / 1000) .. "s")
            end
            M.cancel(bstate)
        end)
    end)

    stdout:read_start(function(err, data)
        if err then
            schedule(function()
                if callbacks.on_error then callbacks.on_error(err) end
            end)
            return
        end
        if not data then return end

        local buf = bstate.partial_line .. data
        local lines = split(buf, "\n", SPLIT_OPTS)
        bstate.partial_line = table.remove(lines) or ""

        local events = {}
        for i = 1, #lines do
            local event = parse_line(lines[i])
            if event then events[#events + 1] = event end
        end
        if #events > 0 then
            schedule(function()
                for i = 1, #events do
                    M._dispatch(events[i], bstate, callbacks)
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

function M._dispatch(event, bstate, callbacks)
    local t = event.type

    if t == "system" then
        bstate.session_id = event.session_id
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
                    elseif block.type == "thinking" and callbacks.on_thinking then
                        callbacks.on_thinking(block.thinking or "")
                    elseif block.type == "tool_use" and callbacks.on_tool_use then
                        if block.id then
                            bstate.active_tools[block.id] = block.name or "unknown"
                        end
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
                local block = content[i]
                if block.type == "tool_result" then
                    if block.tool_use_id and bstate.active_tools then
                        bstate.active_tools[block.tool_use_id] = nil
                    end
                    if callbacks.on_tool_result then
                        callbacks.on_tool_result(block)
                    end
                end
            end
        end

    elseif t == "tool_progress" then
        if callbacks.on_tool_progress then
            callbacks.on_tool_progress(event)
        end

    elseif t == "rate_limit_event" then
        if callbacks.on_rate_limit then
            callbacks.on_rate_limit(event)
        end

    elseif t == "result" then
        if callbacks.on_result then callbacks.on_result(event) end

    elseif t == "error" then
        if callbacks.on_error then
            callbacks.on_error(event.error or "Unknown error")
        end
    end
end

function M._mark_stale_tools(bstate, callbacks)
    if not bstate.active_tools then return end
    for _, name in pairs(bstate.active_tools) do
        if callbacks.on_error then
            callbacks.on_error("Tool interrupted: " .. name)
        end
    end
    bstate.active_tools = {}
end

function M.cancel(bstate)
    if bstate.proc and bstate.running then
        bstate.proc:kill("sigterm")
        vim.defer_fn(function()
            if bstate.proc and bstate.running then
                bstate.proc:kill("sigkill")
            end
        end, 10000)
    end
end

return M
