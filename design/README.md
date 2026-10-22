# Арт лиги для карточек

Сюда лига кладёт картинки, сделанные в ChatGPT. Бот наград подхватывает их сам, со следующего поста. Код менять не нужно.

| Папка | Что | Формат |
|---|---|---|
| `design/backgrounds/<праздник>.png` | фон карточек праздника в стиле спецвыпусков Ultimate Team (Futmas, Shamrock, Scream…) | портрет, 1024×1536 или 1080×1350, без текста |
| `design/logos/<праздник>.png` | логотип лиги, «переодетый» под праздник: на открывашке он заменяет обычный | квадрат 1024×1024, прозрачный фон |

Подходят форматы `.png`, `.webp` и `.jpg`. Файл из `design/` всегда важнее того, что бот нарисовал сам (`awards-bot/assets/holidays/<праздник>-bg.webp`). Если у праздника нет ни того, ни другого, бот ставит его рамку, а если нет и рамки — эмодзи.

Как загрузить с телефона: GitHub → репозиторий → папка `design/backgrounds` (или `design/logos`) → Add file → Upload files. Имя файла — ключ праздника из таблицы ниже, например `halloween.png`.

## Фон праздника

Промпт для ChatGPT. Подставьте тему праздника:

> A full background artwork for a special-edition sports trading card promo, in the style of the holiday promo cards of football card games (like the Christmas, Halloween "Scream" or St Patrick's "Shamrock" promos), portrait 4:5. Theme: **{тема}**. Bold abstract graphic design: diagonal light beams, glossy gradients, angular geometric shards, metallic foil accents and glow, the theme's motifs as a subtle repeating pattern and a few larger stylised motifs towards the edges. The centre stays darker and calmer so white text and photos on top remain readable. No text, no letters, no numbers, no logos, no people.

Центр должен оставаться тёмным и спокойным: поверх него лежат карточки с цифрами. Края могут быть сколь угодно яркими.

## Логотип праздника

Приложите оригинал логотипа (`awards-bot/assets/fbl-logo.png` или исходник лиги) и напишите:

> Use the attached logo (a gold crown on a basketball). Keep its exact shape, proportions and gold colour. Dress it for **{праздник}**: {идея}. Transparent background, centred, no text.

Идеи для логотипа:
- `new-year` — снег на короне, мяч как ёлочный шар;
- `christmas` — шапка Санты на короне;
- `halloween` — мяч-тыква с вырезанным лицом, паутина на короне;
- `st-patrick` — цилиндр лепрекона, клевер;
- `valentine` — мяч-сердце.

## Ключи праздников

| Ключ | Праздник |
|---|---|
| `fbl-start` | 🏀 Старт сезона FBL |
| `fbl-end` | 🏁 Финиш сезона FBL |
| `trade-deadline` | 🔁 Дедлайн обменов НБА |
| `all-star` | 🌟 Матч всех звёзд |
| `play-in` | 🎟️ Плей-ин |
| `playoffs` | 🏆 Старт плей-офф |
| `halloween` | 🎃 Хэллоуин |
| `thanksgiving` | 🦃 День благодарения |
| `christmas` | 🎄 Рождество |
| `new-year` | 🎆 Новый год |
| `orthodox-christmas` | ⭐ Рождество Христово |
| `old-new-year` | 🥂 Старый Новый год |
| `mlk` | 🕊️ День Мартина Лютера Кинга |
| `lunar-new-year` | 🧧 Китайский Новый год |
| `valentine` | ❤️ День святого Валентина |
| `defender` | 🎖️ 23 февраля |
| `womens-day` | 💐 8 марта |
| `maslenitsa` | 🥞 Масленица |
| `st-patrick` | ☘️ День святого Патрика |
| `april-fools` | 🤡 День смеха |
| `cosmonautics` | 🚀 День космонавтики |
| `easter` | 🥚 Пасха |
| `may-day` | 🌷 Первомай |
| `victory-day` | 🎆 День Победы |
| `russia-day` | 🇷🇺 День России |


## Проверить, как выглядит

```sh
node awards-bot/bot.mjs --preview 2026-10-21 --cards out/cards --holiday halloween
```
