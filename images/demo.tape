# VHS Demo for Claude Powerline

# <https://github.com/charmbracelet/vhs>

Output demo.gif
Set FontSize 18
Set Width 1200
Set Height 650
Set Theme "Dracula"

# Start with a clean terminal

Type "# Claude Powerline Demo"
Sleep 1s
Enter

# Start Claude Code session

Type "claude"
Sleep 1s
Enter
Sleep 3s

# Ask an initial question to show session tracking

Type "Can you help me understand async/await in JavaScript?"
Sleep 1s
Enter
Sleep 12s

# Press Enter to continue after Claude responds

Enter
Sleep 3s

# Make a small code change to trigger git status change (using ! for bash commands)

Type "!echo '// Demo update' >> README.md"
Sleep 1s
Enter
Sleep 2s

# Add a new file to show untracked changes

Type "!echo 'console.log(demo);' > temp-demo.js"
Sleep 1s
Enter
Sleep 2s

# Ask a follow-up question to show more costs accumulating

Type "Show me error handling with try/catch blocks"
Sleep 1s
Enter
Sleep 10s

# End with a clear view of the statusline

Sleep 4s
