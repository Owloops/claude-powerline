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

    require("mini.statusline").setup({
        use_icons = true,
        set_vim_settings = false,
    })

    require("mini.notify").setup({
        lsp_progress = { enable = false },
        window = {
            config = { border = "rounded" },
            winblend = 0,
        },
    })

    require("mini.icons").setup()
    require("mini.cursorword").setup()

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
