local M = {}

-- constants --

local TS_PARSERS = { "markdown", "markdown_inline", "lua" }

-- public --

function M.setup()
    vim.api.nvim_create_autocmd("PackChanged", { callback = function(ev)
        if ev.data.spec.name == "nvim-treesitter" then
            if not ev.data.active then vim.cmd.packadd("nvim-treesitter") end
            require("nvim-treesitter").install(TS_PARSERS)
        end
    end })

    vim.api.nvim_create_autocmd("FileType", { callback = function(ev)
        local lang = vim.treesitter.language.get_lang(ev.match)
        if lang and vim.treesitter.language.add(lang) then
            vim.bo[ev.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
            vim.treesitter.start(ev.buf)
        end
    end })

    vim.pack.add({
        "https://github.com/echasnovski/mini.nvim",
        { src = "https://github.com/nvim-treesitter/nvim-treesitter", version = "main" },
        "https://github.com/MeanderingProgrammer/render-markdown.nvim",
    })

    require("nvim-treesitter").install(TS_PARSERS)

    require("mini.notify").setup({
        lsp_progress = { enable = false },
        window = {
            config = { border = "rounded" },
            winblend = 0,
        },
    })

    require("mini.icons").setup()
    require("mini.cursorword").setup()
    require("mini.pick").setup()
    require("mini.tabline").setup({ show_icons = false })

    vim.cmd([[
        function! MiniTablineSwitchBuffer(buf_id, clicks, button, mod)
            let l = luaeval('require("cpline.layout").layout')
            if type(l) == type({}) && has_key(l, 'conv_win')
                call win_execute(l.conv_win, 'buffer ' . a:buf_id)
            endif
        endfunction
    ]])

    require("mini.clue").setup({
        triggers = {
            { mode = "n", keys = "<C-p>" },
            { mode = "i", keys = "<C-p>" },
            { mode = "n", keys = "g" },
        },
        clues = {
            { mode = "n", keys = "gt", desc = "Next Session" },
            { mode = "n", keys = "gT", desc = "Prev Session" },
        },
        window = {
            delay = 200,
            config = { border = "rounded", width = "auto" },
        },
    })

    require("render-markdown").setup({
        file_types = { "markdown" },
        render_modes = { "n", "i", "c" },
        buf_types = { "nofile", "" },
        code = {
            style = "full",
            border = "thin",
        },
    })
end

return M
