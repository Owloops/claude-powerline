#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly PLUGIN_ROOT="${SCRIPT_DIR}/.."

readonly SAMPLE_JSON='{"model":{"id":"claude-sonnet-4-20250514","display_name":"Sonnet 4"},"cost":{"total_cost_usd":0.42,"message_cost_usd":0.03,"duration":"15m"},"context_window":{"context_window_size":200000,"used_percentage":35,"current_usage":{"input_tokens":50000,"cache_creation_input_tokens":10000,"cache_read_input_tokens":5000}},"cwd":"/home/user/my-project","workspace":{"current_dir":"/home/user/my-project"},"session_id":"abc123"}'

setup_tui_transcript() {
    local now_iso user_iso cwd_encoded transcript_dir
    now_iso=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    user_iso=$(date -u -d "-13 seconds" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null \
        || date -u -v-13S +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null \
        || echo "${now_iso}")

    # Encode the preview CWD the same way Claude Code encodes project dirs
    # On Windows: C:\Users\foo\proj -> C--Users-foo-proj
    # On Unix: /home/user/proj -> -home-user-proj
    local preview_cwd
    # Create a temp git repo so previews always show git data
    local fake_repo
    fake_repo="$(mktemp -d)/my-project"
    mkdir -p "${fake_repo}"
    git -C "${fake_repo}" init -b main --quiet 2>/dev/null
    git -C "${fake_repo}" -c user.name="User" -c user.email="u@e.co" commit --allow-empty -m "init" --quiet 2>/dev/null
    git -C "${fake_repo}" checkout -b feat/my-feature --quiet 2>/dev/null
    touch "${fake_repo}/newfile.txt"
    printf 'change\n' > "${fake_repo}/README.md"
    git -C "${fake_repo}" add README.md 2>/dev/null

    # Use native path for Node.js compatibility (Windows needs C:\... not /c/...)
    preview_cwd="$(cd "${fake_repo}" && pwd -W 2>/dev/null || pwd)"
    cwd_encoded="$(printf '%s' "${preview_cwd}" | sed 's|[/\\]|-|g; s|:||g')"
    TUI_PREVIEW_CWD="${preview_cwd}"

    transcript_dir="${HOME}/.claude/projects/${cwd_encoded}"
    TUI_TRANSCRIPT="${transcript_dir}/preview-123.jsonl"
    mkdir -p "${transcript_dir}"
    printf '{"timestamp":"%s","type":"user","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}\n' "${user_iso}" > "${TUI_TRANSCRIPT}"
    printf '{"timestamp":"%s","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}\n' "${now_iso}" >> "${TUI_TRANSCRIPT}"
}

make_tui_sample_json() {
    local resets_5h resets_7d
    resets_5h=$(( $(date +%s) + 15480 ))
    resets_7d=$(( $(date +%s) + 432000 ))

    printf '{"model":{"id":"claude-sonnet-4-20250514","display_name":"Sonnet 4"},"cost":{"total_cost_usd":2.85,"message_cost_usd":0.12,"total_duration_ms":16200000,"total_api_duration_ms":480000,"total_lines_added":342,"total_lines_removed":87},"context_window":{"context_window_size":200000,"used_percentage":42,"total_input_tokens":72000,"total_output_tokens":12000,"current_usage":{"input_tokens":72000,"output_tokens":12000,"cache_creation_input_tokens":15000,"cache_read_input_tokens":8000}},"rate_limits":{"five_hour":{"used_percentage":35,"resets_at":%d},"seven_day":{"used_percentage":28,"resets_at":%d}},"cwd":"%s","workspace":{"current_dir":"%s","project_dir":"%s"},"session_id":"preview-123","version":"1.0.47"}' \
        "${resets_5h}" "${resets_7d}" "${TUI_PREVIEW_CWD}" "${TUI_PREVIEW_CWD}" "${TUI_PREVIEW_CWD}"
}

readonly PREVIEW_CONFIG='{
  "theme": "dark",
  "display": {
    "style": "minimal",
    "charset": "unicode",
    "colorCompatibility": "auto",
    "autoWrap": true,
    "padding": 1,
    "lines": [
      {
        "segments": {
          "directory": { "enabled": true, "style": "fish" },
          "git": { "enabled": true },
          "model": { "enabled": true },
          "session": { "enabled": true, "type": "cost", "costSource": "calculated" },
          "today": { "enabled": true, "type": "cost" },
          "context": { "enabled": true, "showPercentageOnly": false, "displayStyle": "text", "autocompactBuffer": 33000 }
        }
      }
    ]
  },
  "budget": {
    "session": { "warningThreshold": 80 },
    "today": { "amount": 50, "warningThreshold": 80 }
  }
}'

THEME="dark"
STYLE="minimal"
CHARSET="unicode"
COMPARE_STYLES=false
COMPARE_THEMES=false
COMPARE_TUI_LAYOUTS=false
BIN=""
TEMP_FILES=()

# shellcheck disable=SC2329
cleanup() {
    for f in "${TEMP_FILES[@]}"; do
        rm -f "${f}"
    done
}
trap cleanup EXIT

test_binary() {
    local bin="$1"
    printf '{}' | "${bin}" --help >/dev/null 2>&1
}

find_binary() {
    local npm_bin="${PLUGIN_ROOT}/../bin/claude-powerline"
    local dist_file="${PLUGIN_ROOT}/../dist/index.mjs"
    if [[ -f "${npm_bin}" ]] && [[ -f "${dist_file}" ]] && test_binary "${npm_bin}"; then
        printf '%s' "${npm_bin}"
        return 0
    fi

    local path_bin
    if path_bin="$(command -v claude-powerline 2>/dev/null)" && test_binary "${path_bin}"; then
        printf '%s' "${path_bin}"
        return 0
    fi

    printf 'npx'
    return 0
}

make_temp_config() {
    local preview_theme="$1"
    local preview_style="$2"
    local preview_charset="$3"
    local tmp

    tmp="$(mktemp)"
    TEMP_FILES+=("${tmp}")
    printf '%s' "${PREVIEW_CONFIG}" |
        sed -e "s/\"theme\": \"dark\"/\"theme\": \"${preview_theme}\"/" \
            -e "s/\"style\": \"minimal\"/\"style\": \"${preview_style}\"/" \
            -e "s/\"charset\": \"unicode\"/\"charset\": \"${preview_charset}\"/" \
            >"${tmp}"
    printf '%s' "${tmp}"
}

run_preview() {
    local preview_theme="$1"
    local preview_style="$2"
    local preview_charset="$3"
    local tmp_config

    tmp_config="$(make_temp_config "${preview_theme}" "${preview_style}" "${preview_charset}")"

    if [[ "${BIN}" == "npx" ]]; then
        printf '%s' "${SAMPLE_JSON}" | FORCE_COLOR=3 npx -y @owloops/claude-powerline@latest \
            --config="${tmp_config}"
    else
        printf '%s' "${SAMPLE_JSON}" | FORCE_COLOR=3 "${BIN}" \
            --config="${tmp_config}"
    fi
}

run_preview_config() {
    local config_file="$1"
    local sample_data="$2"

    if [[ "${BIN}" == "npx" ]]; then
        printf '%s' "${sample_data}" | FORCE_COLOR=3 npx -y @owloops/claude-powerline@latest \
            --config="${config_file}"
    else
        printf '%s' "${sample_data}" | FORCE_COLOR=3 "${BIN}" \
            --config="${config_file}"
    fi
}

run_compare_tui_layouts() {
    local layouts=(compact standard full)
    local label
    local template_file tmp tui_json fake_repo

    setup_tui_transcript
    tui_json="$(make_tui_sample_json)"
    fake_repo="${TUI_PREVIEW_CWD}"

    for label in "${layouts[@]}"; do
        template_file="${PLUGIN_ROOT}/templates/config-tui-${label}.json"
        if [[ ! -f "${template_file}" ]]; then
            printf '%s: template not found\n\n' "${label}"
            continue
        fi

        tmp="$(mktemp)"
        TEMP_FILES+=("${tmp}")
        sed -e "s/replace:THEME/${THEME}/g" \
            -e "s/replace:CHARSET/${CHARSET}/g" \
            -e "s/\"replace:TODAY_BUDGET\"/50/g" \
            "${template_file}" >"${tmp}"

        printf '%s:\n' "${label}"
        run_preview_config "${tmp}" "${tui_json}"
        printf '\n\n'
    done

    # Clean up fake transcript and git repo
    rm -f "${TUI_TRANSCRIPT}" 2>/dev/null
    rm -rf "${fake_repo%/my-project}" 2>/dev/null
}

run_compare_styles() {
    local styles=(minimal powerline capsule tui)
    local s

    for s in "${styles[@]}"; do
        printf '%s:\n' "${s}"
        run_preview "${THEME}" "${s}" "${CHARSET}"
        printf '\n\n'
    done
}

run_compare_themes() {
    local themes=(dark light nord tokyo-night rose-pine gruvbox)
    local t

    for t in "${themes[@]}"; do
        printf '%s:\n' "${t}"
        run_preview "${t}" "${STYLE}" "${CHARSET}"
        printf '\n\n'
    done
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --theme=*)
                THEME="${1#*=}"
                shift
                ;;
            --theme)
                [[ $# -ge 2 ]] || {
                    printf 'Missing value for --theme\n' >&2
                    exit 1
                }
                THEME="$2"
                shift 2
                ;;
            --style=*)
                STYLE="${1#*=}"
                shift
                ;;
            --style)
                [[ $# -ge 2 ]] || {
                    printf 'Missing value for --style\n' >&2
                    exit 1
                }
                STYLE="$2"
                shift 2
                ;;
            --charset=*)
                CHARSET="${1#*=}"
                shift
                ;;
            --charset)
                [[ $# -ge 2 ]] || {
                    printf 'Missing value for --charset\n' >&2
                    exit 1
                }
                CHARSET="$2"
                shift 2
                ;;
            --compare-styles)
                COMPARE_STYLES=true
                shift
                ;;
            --compare-themes)
                COMPARE_THEMES=true
                shift
                ;;
            --compare-tui-layouts)
                COMPARE_TUI_LAYOUTS=true
                shift
                ;;
            *)
                printf 'Unknown option: %s\n' "$1" >&2
                exit 1
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    BIN="$(find_binary)"

    if [[ "${COMPARE_STYLES}" == "true" ]]; then
        run_compare_styles
        exit 0
    fi

    if [[ "${COMPARE_THEMES}" == "true" ]]; then
        run_compare_themes
        exit 0
    fi

    if [[ "${COMPARE_TUI_LAYOUTS}" == "true" ]]; then
        run_compare_tui_layouts
        exit 0
    fi

    run_preview "${THEME}" "${STYLE}" "${CHARSET}"
    printf '\n'
    exit 0
}

main "$@"
