param(
    [string]$Repo = "sql-quest",
    [string]$Owner = "",
    [switch]$SkipChecks,
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

function Step([string]$Text) { Write-Host ""; Write-Host "==> $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Fail([string]$Text) { Write-Host ""; Write-Host "ОШИБКА: $Text" -ForegroundColor Red; exit 1 }

function Run {
    param([string]$Exe, [string[]]$Arguments, [switch]$AllowFail)
    $line = "$Exe " + ($Arguments -join " ")
    if ($DryRun) { Write-Host "    [dry-run] $line" -ForegroundColor DarkGray; return "" }
    $out = & $Exe @Arguments 2>&1
    if ($LASTEXITCODE -ne 0 -and -not $AllowFail) {
        $out | ForEach-Object { Write-Host "    $_" }
        Fail "команда завершилась с ошибкой: $line"
    }
    return ($out | Out-String).Trim()
}

function Need([string]$Exe, [string]$Hint) {
    if (-not (Get-Command $Exe -ErrorAction SilentlyContinue)) { Fail "не найден $Exe. $Hint" }
}

Step "Проверяю инструменты"
Need "git" "Установи: winget install --id Git.Git -e"
Need "node" "Установи Node.js 22: winget install --id OpenJS.NodeJS.LTS -e"
Need "npm" "npm ставится вместе с Node.js."
Need "gh" "Установи GitHub CLI: winget install --id GitHub.cli -e, затем перезапусти PowerShell."
$nodeMajor = [int]((& node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) { Fail "нужен Node.js 22 или новее, сейчас $(& node -v)." }
Ok "git, node $(& node -v), npm, gh найдены"

Step "Проверяю вход в GitHub"
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Нужно войти в GitHub — откроется браузер." -ForegroundColor Yellow
    & gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { Fail "вход в GitHub не выполнен." }
}
& gh auth setup-git *> $null
$login = (& gh api user -q .login).Trim()
if (-not $Owner) { $Owner = $login }
Ok "вход выполнен как $login, репозиторий: $Owner/$Repo"

if (-not $SkipChecks) {
    Step "Собираю и проверяю проект локально (2–4 минуты)"
    Run "npm" @("ci") | Out-Null
    Ok "зависимости установлены"
    Run "npm" @("run", "build") | Out-Null
    Ok "контент собран, все эталоны прошли, сайт собран"
    Run "npm" @("test") | Out-Null
    Ok "тесты движка прошли"
} else {
    Write-Host "    Локальная проверка пропущена (-SkipChecks)." -ForegroundColor Yellow
}

Step "Готовлю git-репозиторий"
if (-not (Test-Path ".git")) { Run "git" @("init", "-b", "main") | Out-Null }
$name = (& git config user.name)
if (-not $name) {
    $id = (& gh api user -q .id).Trim()
    Run "git" @("config", "user.name", $login) | Out-Null
    Run "git" @("config", "user.email", "$id+$login@users.noreply.github.com") | Out-Null
    Ok "автор коммитов: $login"
}
$branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
if ($branch -and $branch -ne "main" -and $branch -ne "HEAD") { Run "git" @("branch", "-M", "main") | Out-Null }
Run "git" @("add", "-A") | Out-Null
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    Run "git" @("commit", "-m", "Публикация SQL Quest") | Out-Null
    Ok "изменения закоммичены"
} else {
    Ok "новых изменений нет"
}
if (-not (& git rev-parse --verify HEAD 2>$null)) { Fail "в репозитории нет ни одного коммита." }
$headSha = (& git rev-parse HEAD).Trim()

Step "Создаю репозиторий на GitHub"
& gh repo view "$Owner/$Repo" *> $null
$repoExists = ($LASTEXITCODE -eq 0)
if ($repoExists) {
    Ok "репозиторий уже есть"
} else {
    Run "gh" @("repo", "create", "$Owner/$Repo", "--public", "--description", "Игра-тренажёр по SQL на PostgreSQL в браузере") | Out-Null
    Ok "создан https://github.com/$Owner/$Repo"
}
$remoteUrl = "https://github.com/$Owner/$Repo.git"
$remotes = (& git remote) -join " "
if ($remotes -match "\borigin\b") { Run "git" @("remote", "set-url", "origin", $remoteUrl) | Out-Null }
else { Run "git" @("remote", "add", "origin", $remoteUrl) | Out-Null }

Step "Включаю GitHub Pages через GitHub Actions"
$pagesOut = Run "gh" @("api", "-X", "POST", "repos/$Owner/$Repo/pages", "-f", "build_type=workflow") -AllowFail
if (-not $DryRun -and $LASTEXITCODE -ne 0) {
    Run "gh" @("api", "-X", "PUT", "repos/$Owner/$Repo/pages", "-f", "build_type=workflow") | Out-Null
}
Ok "Pages настроены на деплой из workflow"

Step "Отправляю код"
Run "git" @("push", "-u", "origin", "main") | Out-Null
Ok "код в ветке main"

if ($DryRun) { Step "Сухой прогон завершён — на GitHub ничего не отправлено"; exit 0 }

Step "Жду запуска сборки на GitHub"
$runId = $null
for ($i = 0; $i -lt 30 -and -not $runId; $i++) {
    Start-Sleep -Seconds 4
    $json = & gh run list --workflow deploy.yml --branch main --limit 5 --json databaseId,headSha 2>$null
    if ($LASTEXITCODE -eq 0 -and $json) {
        $run = ($json | ConvertFrom-Json) | Where-Object { $_.headSha -eq $headSha } | Select-Object -First 1
        if ($run) { $runId = $run.databaseId }
    }
}
if (-not $runId) {
    Run "gh" @("workflow", "run", "deploy.yml", "--ref", "main") | Out-Null
    Start-Sleep -Seconds 6
    $runId = ((& gh run list --workflow deploy.yml --limit 1 --json databaseId) | ConvertFrom-Json)[0].databaseId
}
Ok "сборка #$runId запущена: https://github.com/$Owner/$Repo/actions/runs/$runId"

Step "Сборка и деплой (обычно 3–5 минут)"
& gh run watch $runId --exit-status --interval 10
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    & gh run view $runId --log-failed
    Fail "сборка на GitHub упала. Лог выше и по ссылке https://github.com/$Owner/$Repo/actions/runs/$runId"
}

$url = (& gh api "repos/$Owner/$Repo/pages" -q .html_url).Trim()
Step "Готово"
Write-Host "    Игра опубликована: $url" -ForegroundColor Green
Write-Host "    Первое открытие загружает базу (~10 МБ), дальше игра работает и без сети."
try { Start-Process $url } catch { }
