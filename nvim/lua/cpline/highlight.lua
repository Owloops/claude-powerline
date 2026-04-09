local M = {}

-- aliases --

local hl = vim.api.nvim_set_hl

-- palette --

M.deep = "#0a0e14"
M.surface = "#111827"
M.elevated = "#1a2332"
M.hover = "#1f2a3a"
M.blue = "#5b8cf0"
M.glow = "#7ba6ff"
M.primary = "#d4dae3"
M.secondary = "#8891a0"
M.muted = "#5c6573"
M.green = "#3ec97a"
M.amber = "#e8a83e"
M.red = "#e05c5c"
M.border = "#1e293b"

-- setup --

function M.setup()
    -- layout --

    hl(0, "CplineBg", { bg = M.deep, fg = M.deep })
    hl(0, "CplineConv", { bg = M.deep, fg = M.primary })
    hl(0, "CplineStatus", { bg = M.surface, fg = M.secondary })
    hl(0, "CplineInput", { bg = M.elevated, fg = M.primary })
    hl(0, "CplineBorder", { fg = M.border })
    hl(0, "CplineFloatTitle", { fg = M.glow, bold = true })
    hl(0, "CplineFloatFooter", { fg = M.muted })
    hl(0, "CplineWinbar", { bg = M.surface, fg = M.glow, bold = true })
    hl(0, "CplineWinbarNC", { bg = M.surface, fg = M.muted })

    -- conversation --

    hl(0, "CplineUser", { fg = M.blue, bold = true })
    hl(0, "CplineAssistant", { fg = M.green, bold = true })
    hl(0, "CplineTool", { fg = M.amber, italic = true })
    hl(0, "CplineToolBorder", { fg = "#2a3545" })
    hl(0, "CplineToolLabel", { fg = M.amber, bold = true })
    hl(0, "CplineThinking", { fg = M.muted, italic = true })
    hl(0, "CplineError", { fg = M.red, bold = true })
    hl(0, "CplineMuted", { fg = M.muted })

    -- status panel --

    hl(0, "CplineLabel", { fg = M.muted, bold = true })
    hl(0, "CplineReady", { fg = M.green })
    hl(0, "CplineActive", { fg = M.glow })
    hl(0, "CplineBar", { fg = M.blue })
    hl(0, "CplineWarning", { fg = M.amber })

    -- status badges --

    hl(0, "CplineStatusReady", { bg = "#0f2018", fg = M.green, bold = true })
    hl(0, "CplineStatusActive", { bg = "#0f1a2e", fg = M.glow, bold = true })
    hl(0, "CplineStatusError", { bg = "#2a1318", fg = M.red, bold = true })
    hl(0, "CplineStatusPlan", { bg = "#0f1a2e", fg = M.blue, bold = true })
    hl(0, "CplineStatusExec", { bg = "#2a1f0f", fg = M.amber, bold = true })

    -- gradient labels --

    hl(0, "CplineGrad1", { fg = "#8891a0" })
    hl(0, "CplineGrad2", { fg = "#777f8d" })
    hl(0, "CplineGrad3", { fg = "#666d7a" })
    hl(0, "CplineGrad4", { fg = "#5c6573" })

    -- modes --

    hl(0, "CplinePlan", { fg = M.blue, bold = true })
    hl(0, "CplineExec", { fg = M.amber, bold = true })

    -- diff --

    hl(0, "CplineDiffAdd", { bg = "#132a1e", fg = M.green })
    hl(0, "CplineDiffDel", { bg = "#2a1318", fg = M.red })
    hl(0, "CplineDiffHdr", { fg = M.muted, italic = true })
    hl(0, "CplinePreview", { bg = M.surface, fg = M.primary })

    -- neovim overrides --

    hl(0, "CursorLine", { bg = M.hover })
    hl(0, "Normal", { bg = M.deep, fg = M.primary })
    hl(0, "NormalFloat", { bg = M.surface, fg = M.primary })
    hl(0, "FloatBorder", { fg = M.border })
    hl(0, "WinSeparator", { fg = M.border })
    hl(0, "Visual", { bg = "#1e3a5f" })
    hl(0, "Search", { bg = "#2a4a6f", fg = M.primary })
    hl(0, "IncSearch", { bg = M.blue, fg = M.deep })
    hl(0, "Pmenu", { bg = M.surface, fg = M.primary })
    hl(0, "PmenuSel", { bg = M.elevated, fg = M.primary })
    hl(0, "StatusLine", { bg = M.deep, fg = M.secondary })
    hl(0, "StatusLineNC", { bg = M.deep, fg = M.muted })

    -- plugins --

    hl(0, "MiniNotifyBorder", { fg = M.border })
    hl(0, "MiniNotifyNormal", { bg = M.surface, fg = M.primary })
    hl(0, "MiniNotifyTitle", { fg = M.glow, bold = true })
    hl(0, "MiniCursorword", { underline = true, sp = M.border })
    hl(0, "MiniCursorwordCurrent", { underline = true, sp = M.border })
    hl(0, "RenderMarkdownBg1", { bg = "#0f1520" })
    hl(0, "RenderMarkdownBg2", { bg = "#111a28" })
    hl(0, "RenderMarkdownBg3", { bg = "#131d2e" })
    hl(0, "RenderMarkdownCode", { bg = M.surface })
    hl(0, "RenderMarkdownH1", { fg = M.blue, bold = true })
    hl(0, "RenderMarkdownH2", { fg = M.glow, bold = true })
    hl(0, "RenderMarkdownH3", { fg = M.green, bold = true })
    hl(0, "RenderMarkdownH4", { fg = M.amber })
end

return M
