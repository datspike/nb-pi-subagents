<p>
  <img src="https://raw.githubusercontent.com/datspike/nb-pi-subagents/main/banner.png" alt="pi-subagents" width="1100">
</p>

# pi-subagents

`pi-subagents` передаёт отдельные задачи дочерним агентам Pi. Это удобно для review кода, разведки, реализации, параллельных проверок, сохранённых workflow и фоновой работы.

## Что это за форк

Это независимая линия [`pi-subagents`](https://github.com/nicobailon/pi-subagents) для `datspike/nb-pi-subagents`.
Здесь выборочно переносятся полезные изменения upstream и развиваются собственные решения. Форк не обязан оставаться точной копией или последовательностью патчей к одной версии upstream.

Основная модель делегации сохраняется: foreground и background children, builtin agents, workflows, missions, FleetView, watchdog и extension API.
Главные направления форка:

| Направление | Что меняется для пользователя |
|---|---|
| Контекст для модели | Поверхность делегации остаётся компактной, а подробные инструкции выдаются ограниченными порциями, когда они нужны. |
| Справка для агентов | `subagent({ action: "guide" })` и `/subagents-guide` отдают справку по topic и section с ограниченным объёмом. Она работает и без package skill. |
| Границы доверия | Если проект не trusted, его settings, agents, chains, packages и skills не используются. `agentScope: "project"` завершается с отказом; user и builtin sources остаются доступны. |
| Результаты и восстановление | Progress, status, completion, intercom и retained transcript views ограничены по размеру. Усечение сохраняет полезные метаданные и явно помечает неполный текст. Ошибка сохранения output или artifact не маскируется под успешный результат. |
| Надёжность запусков | Result leases и последовательное продвижение результатов защищают новые payload от устаревших или заменённых данных. Detached и paused runs сохраняют сведения для восстановления. |
| Review и evaluation | Метаданные проверки и controls дочерних команд проходят через делегацию, но внутренние поля review/evaluation не попадают в model-facing schema. |

Форк может расходиться с оригиналом и позже выборочно переносить новые изменения upstream. Проверяй документацию и release notes установленной версии: этот раздел описывает направление форка, а не обещает постоянную уникальность.

<https://github.com/user-attachments/assets/702554ec-faaf-4635-80aa-fb5d6e292fd1>

## Установка

```bash
pi install git:github.com/datspike/nb-pi-subagents.git
```

Этого достаточно. Background children используют SDK хост-системы: npm Pi сохраняет свой detached Node runner, а официальный standalone-релиз Pi 0.86.1 для Linux x64 загружает тот же runner через встроенный SDK Pi. Поддерживаемые границы и проверка описаны в [Standalone background execution](docs/standalone-background.md).

## Первый запуск

Не нужно заранее создавать agents, писать config или учить slash-команды. После установки достаточно попросить Pi обычными словами:

```text
Используй reviewer, чтобы проверить этот diff.
```

```text
Попроси oracle проверить мой план. Пусть он оспорит допущения и скажет, что я мог упустить.
```

```text
Попроси scout разобраться в этом коде с учётом нашей беседы, а затем задать мне уточняющие вопросы.
```

```text
Запусти параллельные проверки: корректность, тесты и лишняя сложность.
```

Этого достаточно. Pi сам решает, вызывать ли `subagent`, какого agent выбрать и как собрать работу.

## Как это работает

Pi — родительская сессия. Subagent — отдельная дочерняя сессия Pi со своей задачей.

После запроса на делегацию Pi запускает child, передаёт ему задачу и возвращает результат. Foreground children работают внутри процесса родительской Pi и показывают ход работы в беседе. Background children продолжают работу в detached runner и остаются доступными для проверки.

Установка extension сама по себе не запускает reviewer в фоне. В свежей сессии Pi сначала может показать небольшой loader `subagents_enable`, а полный `subagent` станет доступен после разрешённой делегации. Для других моделей `subagent` доступен сразу, чтобы не ломать prompt cache. Сложность задачи сама по себе не даёт права на делегацию. `bg_wait` и ответы supervisor доступны и без activation.

Если каждую реализацию нужно проверять, укажи это в задаче или правилах проекта:

```text
После реализации всегда запускай reviewer.
```

## Встроенные агенты

Extension сразу поставляет несколько ролей:

| Agent | Когда использовать |
|---|---|
| `scout` | Быстро найти нужные файлы, точки входа, поток данных и риски. |
| `researcher` | Найти внешнюю документацию и источники. Нужен [pi-web-access](docs/agents.md#web-research-prerequisites). |
| `evidence-auditor` | Независимо проверить claims и источники готового research brief. Нужен [pi-web-access](docs/agents.md#web-research-prerequisites). |
| `worker` | Внести согласованные изменения, проверить их и не угадывать при незакрытом решении. |
| `reviewer` | Проверить реализацию, тесты, крайние случаи и лишнюю сложность. |
| `oracle` | Получить второе мнение до изменения; он не редактирует файлы. |
| `delegate` | Передать общую задачу агенту, который работает близко к родительской сессии. |

Практическое правило: сначала `scout`, затем `researcher` для внешних фактов, `evidence-auditor` для важных claims, `worker` для реализации, свежий `reviewer` для проверки и `oracle`, когда нужно оспорить решение.

## Типовые workflow

В package есть `/council` и `council-mode`, а также примеры профилей `council-*`, которые можно добавить в свой каталог agents.

| Что нужно | Как попросить |
|---|---|
| Второе мнение | «Попроси oracle проверить этот план и найти слабые места». |
| Сложная диагностика | «Используй oracle, чтобы изучить ошибку до изменения кода». |
| Проверка diff | «Попроси reviewer проверить этот diff». |
| Несколько проверок | «Запусти reviewers для корректности, тестов и лишней сложности». |
| Обсуждение решения | «Используй `/council`, чтобы сравнить варианты». |
| Реализация и проверка | «Реализуй это, затем проверь результат». |
| Повторное review | «Повторяй review, пока не останется проблем, но не более 3 раундов». |
| Исполнение утверждённого плана | «Пусть worker реализует согласованный план, затем запусти свежих reviewers». |
| Разведка перед планом | «Попроси scout изучить поток авторизации перед планированием». |
| Фоновая работа | «Запусти это в фоне». |
| Список агентов | «Покажи доступных subagents». |
| Текущие запуски | «Покажи активные async runs». |
| Проверка настройки | «Проверь, правильно ли настроены subagents и intercom». |

Для реализации обычно подходит цепочка `clarify → scout → worker → свежие reviewers → worker`. Готовые `/parallel-review` и `/review-loop` описаны в [Workflows](https://github.com/datspike/nb-pi-subagents/blob/main/docs/workflows.md).

## Где видна работа

Foreground runs показывают ход работы в беседе. Background runs продолжаются после возврата управления.

В TUI под редактором есть FleetView с текущими запусками. `/subagents-fleet` открывает подробный просмотр: там можно изучить children, transcripts, направить или остановить run. Можно также попросить Pi: «Покажи текущие async runs».

Подробнее о run artifacts и наблюдаемости — в [Observability](https://github.com/datspike/nb-pi-subagents/blob/main/docs/observability.md).

Для ограниченного orchestration `maxSubagentSpawnsPerRun` задаёт общий лимит children в одном дереве runs. По умолчанию он равен 64 и не смешивается с active concurrency и общим лимитом spawn для сессии. Подробности — в [Configuration](https://github.com/datspike/nb-pi-subagents/blob/main/docs/configuration.md#maxsubagentspawnsperrun).

## Если что-то пошло не так

```text
/subagents-doctor
```

Или попроси: «Проверь, правильно ли настроены subagents и intercom».

Для справки по установленной версии используй `/subagents-guide [topic]` или `subagent({ action: "guide", topic: "workflows" })`. По умолчанию открывается `overview`. Доступны `overview`, `workflows`, `agents`, `missions`, `observability`, `tool-reference`, `configuration`, `models`, `watchdog`, `extension-api` и `council`.

## Документация

Полная справка находится в `docs/`:

| Документ | Содержание |
|---|---|
| [Контекст форка](https://github.com/datspike/nb-pi-subagents/blob/main/docs/fork-context.md) | Как читать upstream, выбирать изменения и разделять evidence, inference и unknown. |
| [Agents](https://github.com/datspike/nb-pi-subagents/blob/main/docs/agents.md) | Custom agents, frontmatter, builtin agents, tools, extensions, skills и per-agent memory. |
| [Models](https://github.com/datspike/nb-pi-subagents/blob/main/docs/models.md) | Выбор модели, defaults, overrides, thinking levels, model scope и profiles. |
| [Workflows](https://github.com/datspike/nb-pi-subagents/blob/main/docs/workflows.md) | Orchestration, prompt shortcuts, scripted workflows, worktree isolation и передача результата. |
| [Watchdog](https://github.com/datspike/nb-pi-subagents/blob/main/docs/watchdog.md) | Необязательная проверка изменений, scope monitoring, LSP checks и права дочерних tools. |
| [Tool reference](https://github.com/datspike/nb-pi-subagents/blob/main/docs/tool-reference.md) | Параметры `subagent`, management actions, status/control, acceptance gates и external CLI runners. |
| [Observability](https://github.com/datspike/nb-pi-subagents/blob/main/docs/observability.md) | FleetView, просмотр fleet, transcripts, lifecycle artifacts, events и logs. |
| [Missions and schedules](https://github.com/datspike/nb-pi-subagents/blob/main/docs/missions.md) | Durable missions, delivery receipts, timed и recurring runs. |
| [Configuration](https://github.com/datspike/nb-pi-subagents/blob/main/docs/configuration.md) | Все keys `config.json` и переменные окружения. |
| [Extension API](https://github.com/datspike/nb-pi-subagents/blob/main/docs/extension-api.md) | RPC, delegation API, preflight, capability ceilings, trusted workflow resources, background-work providers и Herdr integration. |
