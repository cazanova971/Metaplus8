// ─── ثوابت ───────────────────────────────────────────────────────────────
  const qualityPrompt = "[quality_ref]";
  const negativePromptBase = "text, letters, words, watermark, signature, captions, subtitles, writing, typography, arabic text, english text, numbers, logos, signs, banners, [negative_ref]";
  const motionSafety = "[motion_safety_ref]";
  const AI_PROVIDER_STORAGE_KEY = "story_studio_v8_ai_provider_settings";
  const CARD_STATE_STORAGE_KEY = "story_studio_v8_card_state";
  const DEFAULT_AI_PROVIDER_SETTINGS = {
    geminiApiKeysText: "",
    geminiHeavyModelsText: "gemini-3-flash-preview\ngemini-3.1-flash-lite-preview\ngemini-2.5-flash\ngemini-2.5-pro\ngemini-pro-latest\ngemini-2.5-flash-lite\ngemini-flash-lite-latest\ngemini-flash-latest",
    geminiLightModelsText: "gemini-3-flash-preview\ngemini-3.1-flash-lite-preview\ngemini-2.5-flash\ngemini-2.5-flash-lite\ngemini-flash-lite-latest\ngemini-flash-latest\ngemini-2.5-pro\ngemini-pro-latest"
  };
  const DIALECT_MAP = {
    Arabic: [
      { value: "Modern Standard Arabic (فصحى)", label: "فصحى" },
      { value: "Egyptian Arabic dialect (عامية مصرية)", label: "مصرية" },
      { value: "Gulf Arabic dialect (خليجية)", label: "خليجية" },
      { value: "Levantine Arabic dialect (شامية)", label: "شامية" },
      { value: "Maghrebi Arabic dialect (مغربية)", label: "مغربية" }
    ],
    English: [
      { value: "American English", label: "American" },
      { value: "British English", label: "British" },
      { value: "Australian English", label: "Australian" }
    ],
    French: [
      { value: "Standard French", label: "Standard" },
      { value: "Canadian French", label: "Canadian" }
    ],
    Spanish: [
      { value: "Spanish from Spain", label: "Spain" },
      { value: "Latin American Spanish", label: "Latin American" }
    ],
    German: [
      { value: "Standard German", label: "Standard" }
    ],
    Turkish: [
      { value: "Standard Turkish", label: "Standard" }
    ]
  };
  const YOUTUBE_DIMENSIONS = {
    "768x512": { width: 1920, height: 1080 },
    "512x768": { width: 1080, height: 1920 },
    "768x768": { width: 1080, height: 1080 }
  };
  let IMAGE_STYLE_MAP = {
    stylized3d:  "stylized 3D animated film look, expressive character shapes, polished materials, soft global illumination, appealing proportions, vibrant color harmony, family-animation quality, emotionally readable faces, cinematic depth"
  };

  // ─── حالة التطبيق ─────────────────────────────────────────────────────────
  let phaseOneProject = null;
  let productionPack = [];
  let sceneAssets = [];
  let sceneAudios = [];
  let fullProjectAudio = { wavUrl: "", base64Data: "", error: "" };
  let phaseThreePlan = [];
  let projectTtsStyle = "";
  let projectTtsVoice = "";
  let standaloneAudioSource = { fileName: "", items: [] };
  let standaloneSceneAudios = [];
  let standaloneFullAudio = { wavUrl: "", base64Data: "", error: "" };
  let failedAudioBatches = [];
  let ownStorySource = { fileName: "", text: "" };

  // ─── إعدادات TTS ─────────────────────────────────────────────────────────
  const TTS_KEY_COOLDOWN_MS   = 30_000;   // 30s تبريد للمفاتيح الفاشلة
  const TTS_FETCH_TIMEOUT_MS  = 45_000;   // timeout ابتدائي للـ fetch
  const TTS_TIMEOUT_FACTOR    = 1.6;      // معامل زيادة الـ timeout عند كل استنفاد
  const TTS_TIMEOUT_MAX_MS    = 180_000;  // أقصى timeout (3 دقائق)
  const TTS_TIMEOUT_RETRIES   = 4;        // أقصى عدد مرات زيادة الـ timeout
  const TTS_QUOTA_RETRY_MAX   = 3;        // أقصى إعادة محاولات عند quota
  const TTS_BATCH_CHAR_LIMIT  = 800;      // لو النص أقل من ذلك نرسله في طلب واحد
  const TTS_BATCH_PAUSE_MS    = 3000;     // انتظار أطول بين الدفعات لتخفيف الضغط
  const TTS_SINGLE_REQUEST_CHAR_LIMIT = 800;
  const TTS_MIN_SEGMENT_SEC = 3;
  const ttsKeyFailMap = {}; // { "model::apiKey": { ts, waitMs } }
  function ttsFailKey(model, key) { return `${model}::${key}`; }
  function sanitizeTtsInputText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }
  function normalizeTtsVoice(voice) {
    const fallbackMap = {
      Perseus: "Orus",
      Orbit: "Kore"
    };
    const safeVoice = fallbackMap[String(voice || "").trim()] || String(voice || "").trim();
    const validVoices = new Set([
      "Achernar", "Achird", "Algieba", "Alnilam", "Aoede", "Autonoe",
      "Callirrhoe", "Charon", "Despina", "Enceladus", "Erinome", "Fenrir",
      "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck",
      "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar",
      "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi"
    ]);
    return validVoices.has(safeVoice) ? safeVoice : "Kore";
  }
  let aiProviderSettings = { ...DEFAULT_AI_PROVIDER_SETTINGS };
  let cardState = {};
  let stopRequested = false;
  let activeOperationCount = 0;
  const activeAbortControllers = new Set();
  // ─── دوال مساعدة ─────────────────────────────────────────────────────────
  function updateStopButtonState() {
    const btn = document.getElementById("stopOperationsBtn");
    if (!btn) return;
    btn.disabled = activeOperationCount === 0;
    btn.textContent = stopRequested ? "جارٍ الإيقاف..." : "إيقاف العمليات";
  }
  function beginManagedOperation() {
    activeOperationCount += 1;
    updateStopButtonState();
  }
  function endManagedOperation() {
    activeOperationCount = Math.max(0, activeOperationCount - 1);
    if (activeOperationCount === 0) {
      stopRequested = false;
      activeAbortControllers.clear();
    }
    updateStopButtonState();
  }
  function registerAbortController(controller) {
    if (controller) activeAbortControllers.add(controller);
    return controller;
  }
  function unregisterAbortController(controller) {
    if (controller) activeAbortControllers.delete(controller);
  }
  function clearStopRequest() {
    stopRequested = false;
    updateStopButtonState();
  }
  function isStopError(error) {
    return error?.message === "OPERATION_STOPPED";
  }
  function throwIfStopRequested() {
    if (stopRequested) throw new Error("OPERATION_STOPPED");
  }
  async function waitWithStop(ms) {
    let remaining = Math.max(0, Number(ms) || 0);
    while (remaining > 0) {
      throwIfStopRequested();
      const chunk = Math.min(250, remaining);
      await new Promise((resolve) => setTimeout(resolve, chunk));
      remaining -= chunk;
    }
  }
  function requestStopOperations() {
    if (!activeOperationCount) return;
    stopRequested = true;
    activeAbortControllers.forEach((controller) => {
      try { controller.abort(); } catch (error) {}
    });
    updateStopButtonState();
    updateAiProviderStatus("تم طلب إيقاف العمليات الجارية...");
    const status = document.getElementById("pipelineStatus");
    if (status) status.textContent = "جارٍ إيقاف العمليات... سيتم الاحتفاظ بما اكتمل فقط.";
    const standaloneStatus = document.getElementById("standaloneAudioStatus");
    if (standaloneStatus && standaloneStatus.textContent.trim()) {
      standaloneStatus.textContent = "جارٍ إيقاف العمليات... سيتم الاحتفاظ بما اكتمل فقط.";
    }
  }
  function normalizeText(text) {
    return String(text || "").replace(/\r/g, "").trim();
  }
  function normalizeBlockText(text) {
    return String(text || "").replace(/\r/g, "").trim();
  }
  function sanitizeMotionText(text) {
    const blockedPatterns = [
      /\bdust(?:y)?\b/i,
      /\bdust\s*motes?\b/i,
      /\bdirt\b/i,
      /\bdebris\b/i,
      /\bparticles?\b/i,
      /\bfloating particles?\b/i,
      /\bash\b/i,
      /\bembers?\b/i,
      /\bsmoke\b/i,
      /\bfog\b/i,
      /\bhaze\b/i,
      /\bmist\b/i,
      /\bsand\s*(?:particles?|swirl(?:ing)?|blowing|storm)\b/i
    ];
    const segments = String(text || "")
      .split(/\s*,\s*/)
      .map((segment) => normalizeText(segment))
      .filter(Boolean)
      .filter((segment) => blockedPatterns.every((pattern) => !pattern.test(segment)));
    return segments.join(", ").replace(/\s{2,}/g, " ").trim();
  }
  function stripLeadingStyleDirectives(prompt) {
    let text = normalizeText(prompt);
    const styleLeadPattern = /^(?:(?:stylized 3d animated film look|stylized 3d render|realistic cgi|stylized 2d cartoon illustration|2d cartoon|disney-like|cinematic(?: film still)?|film still|3d render(?: style)?|3d-render(?:ed)?(?: style)?|anime(?: art style)?|illustrated|photorealistic|realistic photography|oil painting|comic book illustration|dark fantasy art|watercolor illustration|watercolor painting|simple stick figure drawing|minimalist black lines on white background|flat design illustration|neon cyberpunk illustration|neon cyberpunk art|vintage retro illustration|vintage retro style|isometric illustration|digital art|volumetric lighting|ray tracing|physically based materials|soft global illumination)[,.\-\s]*)+/i;
    text = text.replace(styleLeadPattern, "").trim();
    return text.replace(/^[,.\-\s]+/, "").trim();
  }
  function cleanJsonResponse(raw) {
    const text = normalizeText(raw)
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    return start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;
  }
  function escapeNewlinesInsideJsonStrings(text) {
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        out += ch;
        inString = !inString;
        continue;
      }
      if (inString && ch === "\n") {
        out += "\\n";
        continue;
      }
      if (inString && ch === "\t") {
        out += "\\t";
        continue;
      }
      out += ch;
    }
    return out;
  }
  function stripTrailingCommas(text) {
    let repaired = text;
    let prev = "";
    do {
      prev = repaired;
      repaired = repaired.replace(/,\s*([}\]])/g, "$1");
    } while (repaired !== prev);
    return repaired;
  }
  function normalizeSmartQuotes(text) {
    return String(text || "")
      .replace(/[\u201C\u201D]/g, "\"")
      .replace(/[\u2018\u2019]/g, "'");
  }
  function extractBalancedJsonObject(text) {
    const source = String(text || "");
    const start = source.indexOf("{");
    if (start < 0) return source;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return source.slice(start);
  }
  function repairJsonResponse(raw) {
    let text = cleanJsonResponse(raw);
    text = extractBalancedJsonObject(text);
    text = normalizeSmartQuotes(text);
    text = escapeNewlinesInsideJsonStrings(text);
    text = stripTrailingCommas(text);
    return text.trim();
  }
  function safeParseJson(raw) {
    const direct = cleanJsonResponse(raw);
    try {
      return JSON.parse(direct);
    } catch (firstError) {
      const repaired = repairJsonResponse(raw);
      try {
        return JSON.parse(repaired);
      } catch (secondError) {
        const previewStart = Math.max(0, Number(secondError?.message?.match(/position (\d+)/)?.[1] || 0) - 120);
        const preview = repaired.slice(previewStart, previewStart + 240);
        throw new Error(`JSON parse failed after auto-repair. ${secondError.message}. Preview: ${preview}`);
      }
    }
  }
  function parseMultilineList(rawText) {
    return String(rawText || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  function maskApiKey(apiKey) {
    const value = String(apiKey || "").trim();
    return value ? `••••${value.slice(-4)}` : "بدون مفتاح";
  }
  function normalizeGeminiModelName(modelName) {
    const value = String(modelName || "").trim();
    if (!value) return "";
    return value.replace(/^models\//i, "");
  }
  // ─── اللهجة ───────────────────────────────────────────────────────────────
  function updateDialectOptions() {
    const lang = document.getElementById("storyLanguageSelect").value;
    const select = document.getElementById("dialectSelect");
    const options = DIALECT_MAP[lang] || [{ value: lang, label: "Standard" }];
    select.innerHTML = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
  }
  // ─── الصوت UI ─────────────────────────────────────────────────────────────
  function syncAudioUi() {
    const enabled = document.getElementById("audioEnabledToggle").checked;
    document.getElementById("audioSettingsBox").style.display = enabled ? "block" : "none";
    document.getElementById("phase4Card").style.display = enabled ? "block" : "none";
  }
  function syncCreativeControlUi() {
    const autoEnabled = document.getElementById("creativeAutoToggle")?.checked;
    const genreField = document.getElementById("storyGenreSelect")?.closest(".field");
    const narratorField = document.getElementById("narratorSelect")?.closest(".field");
    const genreSelect = document.getElementById("storyGenreSelect");
    const narratorSelect = document.getElementById("narratorSelect");
    const note = document.getElementById("creativeAutoNote");
    if (genreSelect) genreSelect.disabled = Boolean(autoEnabled);
    if (narratorSelect) narratorSelect.disabled = Boolean(autoEnabled);
    if (genreField) genreField.classList.toggle("auto-managed", Boolean(autoEnabled));
    if (narratorField) narratorField.classList.toggle("auto-managed", Boolean(autoEnabled));
    if (note) note.style.display = autoEnabled ? "block" : "none";
  }
  function syncOwnStoryUi() {
    const on = document.getElementById("ownStoryToggle")?.checked;
    const box = document.getElementById("ownStoryBox");
    if (box) box.style.display = on ? "block" : "none";
  }
  function handleOwnStoryFile(event) {
    const file = event.target.files && event.target.files[0];
    const statusEl = document.getElementById("ownStoryStatus");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = normalizeText(String(reader.result || ""));
      ownStorySource = { fileName: file.name, text };
      if (statusEl) {
        statusEl.style.display = "block";
        if (text) {
          const wc = text.split(/\s+/).filter(Boolean).length;
          statusEl.textContent = `تم تحميل «${file.name}» — ${wc} كلمة تقريبًا. سيبدأ التوليد من هذا النص.`;
        } else {
          statusEl.textContent = `الملف «${file.name}» فارغ.`;
        }
      }
    };
    reader.onerror = () => {
      ownStorySource = { fileName: "", text: "" };
      if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "تعذّر قراءة الملف."; }
    };
    reader.readAsText(file, "UTF-8");
  }
  function populateStandaloneAudioVoiceOptions() {
    const target = document.getElementById("standaloneAudioVoiceSelect");
    const source = document.getElementById("audioVoiceSelect");
    if (!target || !source || target.options.length) return;
    target.innerHTML = source.innerHTML;
    target.value = source.value || "auto";
  }
  function syncAudioModeUi() { /* لا يوجد عناصر تخفي/تظهر في v26 */ }
  function getSelectOptionValues(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return [];
    return Array.from(select.options).map((option) => option.value).filter(Boolean);
  }
  // ─── إعدادات Gemini ───────────────────────────────────────────────────────
  function loadAiProviderSettings() {
    try {
      const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_AI_PROVIDER_SETTINGS };
      return { ...DEFAULT_AI_PROVIDER_SETTINGS, ...(JSON.parse(raw) || {}) };
    } catch (error) {
      console.error(error);
      return { ...DEFAULT_AI_PROVIDER_SETTINGS };
    }
  }
  function syncAiProviderUi() {
    document.getElementById("geminiApiKeysInput").value = aiProviderSettings.geminiApiKeysText || "";
    document.getElementById("geminiHeavyModelsInput").value = aiProviderSettings.geminiHeavyModelsText || "";
    document.getElementById("geminiLightModelsInput").value = aiProviderSettings.geminiLightModelsText || "";
  }
  function updateAiProviderStatus(text, isError = false) {
    const status = document.getElementById("aiProviderStatus");
    status.textContent = text || "";
    status.style.color = isError ? "var(--danger)" : "var(--accent)";
  }
  function collectAiProviderSettingsFromUi() {
    return {
      ...aiProviderSettings,
      geminiApiKeysText: normalizeBlockText(document.getElementById("geminiApiKeysInput").value),
      geminiHeavyModelsText: normalizeBlockText(document.getElementById("geminiHeavyModelsInput").value),
      geminiLightModelsText: normalizeBlockText(document.getElementById("geminiLightModelsInput").value)
    };
  }
  function saveAiProviderSettings() {
    aiProviderSettings = collectAiProviderSettingsFromUi();
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, JSON.stringify(aiProviderSettings));
    syncAiProviderUi();
    const keyCount = parseMultilineList(aiProviderSettings.geminiApiKeysText).length;
    const heavyCount = parseMultilineList(aiProviderSettings.geminiHeavyModelsText).length;
    const lightCount = parseMultilineList(aiProviderSettings.geminiLightModelsText).length;
    updateAiProviderStatus(`تم حفظ إعدادات Gemini | keys: ${keyCount} | heavy: ${heavyCount} | light: ${lightCount}`);
  }
  function getGeminiApiKeys() {
    return parseMultilineList(aiProviderSettings.geminiApiKeysText);
  }
  function getGeminiModels(taskType) {
    const text = taskType === "heavy"
      ? aiProviderSettings.geminiHeavyModelsText
      : aiProviderSettings.geminiLightModelsText;
    return parseMultilineList(text).map(normalizeGeminiModelName).filter(Boolean);
  }
  // ─── توليد النص عبر Gemini ───────────────────────────────────────────────
  async function generateTextWithGemini(prompt, taskType = "heavy") {
    const apiKeys = getGeminiApiKeys();
    const models = getGeminiModels(taskType);
    if (!apiKeys.length) throw new Error("No Gemini API keys configured.");
    if (!models.length) throw new Error("No Gemini models configured.");
    const errors = [];
    for (const modelName of models) {
      throwIfStopRequested();
      for (const apiKey of apiKeys) {
        throwIfStopRequested();
        const controller = registerAbortController(new AbortController());
        try {
          updateAiProviderStatus(`Gemini يعمل الآن عبر ${modelName} | key ${maskApiKey(apiKey)}`);
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${normalizeGeminiModelName(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { temperature: taskType === "heavy" ? 0.75 : 0.55 }
            })
          });
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
          if (!response.ok || !text) throw new Error(data?.error?.message || `Gemini request failed with status ${response.status}`);
          updateAiProviderStatus(`نجح Gemini عبر ${modelName} | key ${maskApiKey(apiKey)}`);
          return text;
        } catch (error) {
          if (error?.name === "AbortError" && stopRequested) throw new Error("OPERATION_STOPPED");
          console.error(error);
          errors.push(`${modelName} / ${maskApiKey(apiKey)}`);
        } finally {
          unregisterAbortController(controller);
        }
      }
    }
    throw new Error(`Gemini failed across all configured models/keys: ${errors.join(" | ")}`);
  }

  // ─── توليد الصوت (Gemini TTS) ─────────────────────────────────────────────
  function createWavDataUrl(base64Data, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
    const pcmBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + pcmBytes.length);
    const view = new DataView(buffer);
    const bytesPerSample = bitsPerSample / 8;
    const byteRate = sampleRate * channels * bytesPerSample;
    const blockAlign = channels * bytesPerSample;
    function wa(offset, text) {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    }
    wa(0, "RIFF");
    view.setUint32(4, 36 + pcmBytes.length, true);
    wa(8, "WAVE");
    wa(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    wa(36, "data");
    view.setUint32(40, pcmBytes.length, true);
    new Uint8Array(buffer, headerSize).set(pcmBytes);
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  }
  // استخراج وقت الانتظار من رسالة 429
  function parseRetryAfterMs(errMsg) {
    const m = String(errMsg).match(/retry in ([\d.]+)s/i);
    if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 1000; // +1s هامش أمان
    return TTS_KEY_COOLDOWN_MS;
  }

  // ─── fetch مع timeout تكيّفي ──────────────────────────────────────────────
  // لو لم يصل رد في المدة → يزيدها ويعيد، حتى TTS_TIMEOUT_RETRIES مرة
  async function fetchWithAdaptiveTimeout(url, bodyJson, statusEl) {
    let timeoutMs = TTS_FETCH_TIMEOUT_MS;
    for (let t = 0; t < TTS_TIMEOUT_RETRIES; t++) {
      throwIfStopRequested();
      const ctrl = registerAbortController(new AbortController());
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyJson,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        return res; // استُلم الرد — سواء نجاح أو خطأ HTTP
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError" && stopRequested) {
          throw new Error("OPERATION_STOPPED");
        }
        if (err.name === "AbortError") {
          // انتهت المدة بدون رد → زيادة الـ timeout وإعادة المحاولة
          timeoutMs = Math.min(Math.round(timeoutMs * TTS_TIMEOUT_FACTOR), TTS_TIMEOUT_MAX_MS);
          const sec = Math.round(timeoutMs / 1000);
          if (statusEl) statusEl.textContent = `لم يصل رد بعد — أزيد وقت الانتظار لـ ${sec}s...`;
          updateAiProviderStatus(`⏳ لا يوجد رد بعد — timeout جديد: ${sec}s`);
          continue;
        }
        throw err; // خطأ شبكة حقيقي
      } finally {
        unregisterAbortController(ctrl);
      }
    }
    throw new Error(`TTS: انتهت كل محاولات الانتظار (${TTS_TIMEOUT_RETRIES}x) بدون رد`);
  }

  // ─── callGeminiTts — قريب من النسخة الناجحة مع retry محدود للـ quota ─────
  async function callGeminiTts(text, voice, primaryModel, apiKeys, statusEl, _quotaRetry = 0) {
    const cleanText = sanitizeTtsInputText(text);
    const safeVoice = normalizeTtsVoice(voice);
    if (!cleanText) throw new Error("TTS text is empty.");
    const model = normalizeText(primaryModel) || "gemini-2.5-flash-preview-tts";
    const now = Date.now();
    let lastError = "";
    let sawQuota = false;

    const readyKeys = apiKeys.filter(k => {
      const fk = ttsFailKey(model, k);
      if (!ttsKeyFailMap[fk]) return true;
      return (now - ttsKeyFailMap[fk].ts) >= ttsKeyFailMap[fk].waitMs;
    });

    const keysToUse = readyKeys.length ? readyKeys : apiKeys;
    for (const apiKey of keysToUse) {
      throwIfStopRequested();
      try {
        if (statusEl) statusEl.textContent = `TTS | ${model} | voice: ${safeVoice} | ${maskApiKey(apiKey)}`;
        updateAiProviderStatus(`TTS | ${model} | ${maskApiKey(apiKey)}`);

        const response = await fetchWithAdaptiveTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          JSON.stringify({
            contents: [{ parts: [{ text: cleanText }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } } }
            }
          }),
          statusEl
        );

        const data = await response.json();
        const base64Data = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!response.ok || !base64Data) {
          const msg = data?.error?.message || `TTS HTTP ${response.status}`;
          const isQuota = response.status === 429 || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
          const isBadRequest = response.status === 400 || msg.includes("INVALID_ARGUMENT") || msg.includes("Bad Request");
          if (isBadRequest) {
            throw new Error(`TTS طلب غير صالح: ${msg}`);
          }
          if (isQuota) {
            sawQuota = true;
            ttsKeyFailMap[ttsFailKey(model, apiKey)] = { ts: Date.now(), waitMs: parseRetryAfterMs(msg) };
            lastError = msg;
            continue;
          }
          lastError = msg;
          continue;
        }

        delete ttsKeyFailMap[ttsFailKey(model, apiKey)];
        return base64Data;
      } catch (error) {
        lastError = error.message;
        if (String(error.message).includes("TTS طلب غير صالح")) {
          throw error;
        }
      }
    }

    if (sawQuota && _quotaRetry < TTS_QUOTA_RETRY_MAX) {
      const remaining = Object.values(ttsKeyFailMap)
        .map(v => Math.max(0, v.waitMs - (Date.now() - v.ts)))
        .filter(w => w > 0);
      const waitMs = remaining.length ? Math.min(...remaining) : TTS_KEY_COOLDOWN_MS;
      const sec = Math.ceil(waitMs / 1000);
      updateAiProviderStatus(`⏳ quota على المفاتيح — إعادة بعد ${sec}s (${_quotaRetry + 1}/${TTS_QUOTA_RETRY_MAX})`);
      if (statusEl) statusEl.textContent = `quota على المفاتيح — انتظار ${sec}s...`;
      await waitWithStop(waitMs + 500);
      return callGeminiTts(cleanText, safeVoice, model, apiKeys, statusEl, _quotaRetry + 1);
    }

    throw new Error(`TTS failed: ${lastError}`);
  }

  // ─── توليد أسلوب TTS ديناميكي ────────────────────────────────────────────
  const TTS_VOICE_LIST = [
    { name: "Aoede",   gender: "female", character: "warm, gentle, emotional storytelling" },
    { name: "Kore",    gender: "female", character: "clear, precise, educational, news" },
    { name: "Leda",    gender: "female", character: "soft, calm, soothing, meditation" },
    { name: "Zephyr",  gender: "female", character: "light, breezy, casual, lifestyle" },
    { name: "Puck",    gender: "male",   character: "energetic, playful, comedy, youth" },
    { name: "Charon",  gender: "male",   character: "deep, dramatic, thriller, mystery" },
    { name: "Fenrir",  gender: "male",   character: "powerful, assertive, action, sports" },
    { name: "Orus",    gender: "male",   character: "formal, authoritative, documentary" },
    { name: "Enceladus", gender: "male", character: "firm, confident, broadcast-style narration" },
    { name: "Iapetus", gender: "male",   character: "measured, thoughtful, long-form narration" },
    { name: "Umbriel", gender: "neutral", character: "reserved, calm, atmospheric delivery" },
    { name: "Algieba", gender: "neutral", character: "balanced, polished, versatile delivery" },
    { name: "Rasalgethi", gender: "neutral", character: "dramatic, rich, trailer-like tone" },
    { name: "Schedar", gender: "neutral", character: "soft authority, elegant documentary tone" },
    { name: "Sadaltager", gender: "neutral", character: "clean, stable, explanatory delivery" }
  ];

  async function generateTtsStylePrompt(project, input) {
    const effectiveNarrator = project?.narratorPersona || input?.narrator || "";
    const voiceListStr = TTS_VOICE_LIST.map(v => `${v.name} (${v.gender}, ${v.character})`).join("; ");
    const prompt = [
      "You are an expert audio director for video narration.",
      "Respond ONLY with valid JSON. No markdown, no explanation.",
      `JSON format: { "voice": "<voice_name>", "style": "<2-3 sentence TTS instruction>" }`,
      `Available voices: ${voiceListStr}.`,
      `Pick the SINGLE best voice for this project based on: narrator persona, story tone, target audience, and genre.`,
      `Narrator persona: "${effectiveNarrator}".`,
      `Language: ${project.language}. Dialect: ${project.dialect || "Standard"}.`,
      `Story genre: ${project.concept?.genre || ""}. Tone: ${project.concept?.tone || ""}.`,
      `Target audience: ${project.concept?.audience_selected || input.audience}.`,
      `Story summary: ${project.story?.story_summary || ""}.`,
      "The style instruction MUST cover:",
      `1. Voice character and delivery tone matching narrator persona "${effectiveNarrator}".`,
      `2. Dialect and pronunciation: specify dialect clearly (e.g. Egyptian Arabic, Gulf Arabic, MSA, etc).`,
      `3. Speaking pace: NEVER slow. Natural or fast only. Fast for action/suspense/comedy. STRICTLY NO sluggish delivery.`,
      `4. Dynamic intonation: RAISE volume+pace for dramatic/hook/climax moments; LOWER slightly (never below natural) for emotional/reflective moments.`,
      `5. Pause behavior: after each sentence or strong comma, leave a clear natural pause of about 1-2 seconds when appropriate, especially between scene-like beats, to improve downstream silence-based segmentation without sounding robotic.`,
    ].join(" ");
    const raw = await generateTextWithGemini(prompt, "light");
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      return { voice: parsed.voice || "", style: parsed.style || raw };
    } catch {
      return { voice: "", style: raw };
    }
  }

  // ─── قراءة إدخالات المشروع ───────────────────────────────────────────────
  function getProjectInput() {
    return {
      title: normalizeText(document.getElementById("storyTitleInput").value),
      hook: normalizeText(document.getElementById("storyHookInput").value),
      language: document.getElementById("storyLanguageSelect").value,
      dialect: document.getElementById("dialectSelect").value,
      creativeAuto: document.getElementById("creativeAutoToggle").checked,
      genre: document.getElementById("storyGenreSelect").value,
      narrator: document.getElementById("narratorSelect").value,
      audience: document.getElementById("audienceSelect").value,
      wordCount: Math.max(50, Number(document.getElementById("wordCountInput").value) || 300),
      imageStyle: document.getElementById("imageStyleSelect").value,
      preserveMotionDetail: document.getElementById("preserveMotionDetailToggle").checked,
      audioEnabled: document.getElementById("audioEnabledToggle").checked,
      audioVoice: document.getElementById("audioVoiceSelect").value,
      audioModel: normalizeText(document.getElementById("audioModelInput").value) || "gemini-2.5-flash-preview-tts",
      audioParallel: Math.max(1, Number(document.getElementById("audioParallelSelect").value) || 3),
      audioMode: document.getElementById("audioModeSelect").value || "all-in-one",
      useOwnStory: document.getElementById("ownStoryToggle")?.checked || false,
      ownStoryText: ownStorySource.text || "",
      ownStoryMode: document.getElementById("ownStoryModeSelect")?.value || "enhance",
      skipImageStage: document.getElementById("skipImageStageToggle")?.checked || false
    };
  }
  function getStandaloneAudioInput() {
    return {
      audioVoice: document.getElementById("standaloneAudioVoiceSelect").value || "auto",
      audioModel: normalizeText(document.getElementById("standaloneAudioModelInput").value) || "gemini-2.5-flash-preview-tts",
      audioParallel: Math.max(1, Number(document.getElementById("standaloneAudioParallelSelect").value) || 3),
      audioMode: document.getElementById("standaloneAudioModeSelect").value || "all-in-one",
      stylePrefix: normalizeText(document.getElementById("standaloneAudioStylePrefixInput").value)
    };
  }
  function syncStandaloneRunButtons() {
    const hasItems = standaloneAudioSource.items.length > 0;
    document.getElementById("runStandaloneAudioBtn").disabled = !hasItems;
    document.getElementById("downloadStandaloneAudioBtn").disabled = !(standaloneSceneAudios.some((item) => item?.wavUrl) || standaloneFullAudio?.wavUrl);
  }
  function resetStandaloneAudioStudio() {
    standaloneAudioSource = { fileName: "", items: [] };
    standaloneSceneAudios = [];
    standaloneFullAudio = { wavUrl: "", base64Data: "", error: "" };
    const input = document.getElementById("standaloneAudioFileInput");
    if (input) input.value = "";
    const meta = document.getElementById("standaloneAudioFileMeta");
    meta.style.display = "none";
    meta.textContent = "";
    document.getElementById("standaloneAudioStatus").textContent = "";
    renderStandaloneAudioList();
    syncStandaloneRunButtons();
  }
  function normalizeStandaloneAudioItems(items) {
    return (items || []).map((item, index) => {
      const narration = normalizeText(item?.narration || item?.text || item?.sentence || item?.line || "");
      return {
        scene_number: Number(item?.scene_number || item?.id || index + 1) || (index + 1),
        title: normalizeText(item?.title || `جملة ${index + 1}`),
        narration
      };
    }).filter((item) => item.narration);
  }
  function getStandaloneSceneNumberFromFileName(fileName, fallbackIndex = 1) {
    const match = String(fileName || "").match(/(\d+)/);
    return match ? Number(match[1]) || fallbackIndex : fallbackIndex;
  }
  function extractNarrationFromSceneFileText(rawText) {
    const text = String(rawText || "").replace(/\r/g, "").trim();
    if (!text) return "";
    const blocks = text.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
    if (blocks.length > 1) {
      const body = blocks.slice(1).join("\n\n").trim();
      if (body) return body;
    }
    const cleanedLines = text.split("\n")
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .filter((line) => !/^scene\s+\d+/i.test(line))
      .filter((line) => !/^duration\s*:/i.test(line))
      .filter((line) => !/^مشهد\s+\d+/i.test(line))
      .filter((line) => !/^المدة\s*:/i.test(line));
    return cleanedLines.join(" ").replace(/\s+/g, " ").trim();
  }
  function parseStandaloneAudioFile(rawText, fileName = "", fallbackIndex = 1) {
    const text = String(rawText || "").trim();
    const lowerName = String(fileName || "").toLowerCase();
    if (!text) return [];
    if (lowerName.endsWith(".json") || text.startsWith("{") || text.startsWith("[")) {
      const parsed = safeParseJson(text);
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed?.scenes || parsed?.items || parsed?.lines || parsed?.sentences || [];
      const items = normalizeStandaloneAudioItems(candidates);
      if (items.length) return items;
      throw new Error("ملف JSON لا يحتوي على scenes/items صالحة للصوت.");
    }
    const looksLikeSceneFile = /^scene[_\-\s]?\d+/i.test(lowerName)
      || /(^|\n)\s*Scene\s+\d+/i.test(text)
      || /(^|\n)\s*Duration\s*:/i.test(text)
      || /(^|\n)\s*مشهد\s+\d+/i.test(text)
      || /(^|\n)\s*المدة\s*:/i.test(text);
    if (looksLikeSceneFile) {
      const narration = extractNarrationFromSceneFileText(text);
      if (!narration) return [];
      return [{
        scene_number: getStandaloneSceneNumberFromFileName(fileName, fallbackIndex),
        title: normalizeText(String(fileName || `مشهد ${fallbackIndex}`).replace(/\.[^.]+$/, "")),
        narration
      }];
    }
    return normalizeStandaloneAudioItems(
      text.split(/\r?\n/)
        .map((line) => normalizeText(line))
        .filter(Boolean)
        .map((line, index) => ({ scene_number: index + 1, title: `جملة ${index + 1}`, narration: line }))
    );
  }
  function parseStandaloneAudioSource(rawText, fileName = "") {
    return parseStandaloneAudioFile(rawText, fileName, 1);
  }
  async function handleStandaloneAudioFile(event) {
    const files = Array.from(event?.target?.files || []);
    if (!files.length) return;
    const status = document.getElementById("standaloneAudioStatus");
    try {
      status.textContent = files.length > 1 ? "جارٍ قراءة ملفات المشاهد..." : "جارٍ قراءة ملف الصوت...";
      const parsedGroups = await Promise.all(files.map(async (file, index) => {
        const raw = await file.text();
        return parseStandaloneAudioFile(raw, file.name, index + 1);
      }));
      const items = parsedGroups.flat().sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
      standaloneAudioSource = {
        fileName: files.length === 1 ? files[0].name : `${files.length}_scene_files`,
        items
      };
      standaloneSceneAudios = new Array(items.length).fill(null).map(() => ({ wavUrl: "", base64Data: "", error: "" }));
      standaloneFullAudio = { wavUrl: "", base64Data: "", error: "" };
      const meta = document.getElementById("standaloneAudioFileMeta");
      meta.style.display = "inline-flex";
      meta.textContent = files.length === 1
        ? `${files[0].name} | ${items.length} عنصر صوتي`
        : `${files.length} ملفات | ${items.length} عنصر صوتي`;
      status.textContent = files.length === 1
        ? `تم تحميل ${items.length} عنصر من الملف.`
        : `تم تحميل ${items.length} عنصر من ${files.length} ملفات مشاهد.`;
      renderStandaloneAudioList();
      syncStandaloneRunButtons();
    } catch (error) {
      console.error(error);
      standaloneAudioSource = { fileName: "", items: [] };
      standaloneSceneAudios = [];
      standaloneFullAudio = { wavUrl: "", base64Data: "", error: "" };
      document.getElementById("standaloneAudioStatus").textContent = `تعذر قراءة الملف: ${error.message}`;
      renderStandaloneAudioList();
      syncStandaloneRunButtons();
    }
  }
  function renderStandaloneAudioList() {
    const list = document.getElementById("standaloneAudioList");
    if (!standaloneAudioSource.items.length) {
      list.innerHTML = `<div class="hint">ارفع ملف الجمل أولًا، ثم شغّل توليد الصوت فقط من هنا.</div>`;
      return;
    }
    const fullAudioHtml = standaloneFullAudio?.wavUrl ? `
      <article class="project-audio-card">
        <div class="scene-head">
          <div class="scene-title">الصوت الكامل للاستوديو المستقل</div>
          <div class="scene-meta">نسخة كاملة</div>
        </div>
        <div class="audio-player-wrap"><audio controls src="${standaloneFullAudio.wavUrl}"></audio></div>
        <div class="asset-actions">
          <button class="small-btn audio-btn" onclick="downloadStandaloneFullAudio()">تحميل الصوت الكامل WAV</button>
        </div>
      </article>
    ` : "";
    list.innerHTML = fullAudioHtml + standaloneAudioSource.items.map((item, index) => {
      const audio = standaloneSceneAudios[index];
      const audioHtml = audio?.wavUrl
        ? `<div class="audio-player-wrap"><audio controls src="${audio.wavUrl}"></audio></div>`
        : audio?.error === "split_failed_full_audio_available"
          ? `<div class="audio-pending">تعذر تقطيع هذا العنصر، لكن الملف الكامل متاح.</div>`
          : audio?.error
            ? `<div class="audio-pending" style="color:var(--danger);">فشل توليد الصوت</div>`
            : `<div class="audio-pending">بانتظار التوليد</div>`;
      return `
        <article class="standalone-audio-card">
          <div class="scene-head">
            <div class="scene-title">${item.title || `جملة ${index + 1}`}</div>
            <div class="scene-meta">#${item.scene_number || index + 1}</div>
          </div>
          <div class="standalone-audio-text">${item.narration || ""}</div>
          ${audioHtml}
          <div class="asset-actions">
            ${audio?.wavUrl ? `<button class="small-btn audio-btn" onclick="downloadStandaloneSceneAudio(${index})">تحميل WAV</button>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }
  function copyMainAudioSettingsToStandalone() {
    document.getElementById("standaloneAudioVoiceSelect").value = document.getElementById("audioVoiceSelect").value;
    document.getElementById("standaloneAudioParallelSelect").value = document.getElementById("audioParallelSelect").value;
    document.getElementById("standaloneAudioModelInput").value = document.getElementById("audioModelInput").value;
    document.getElementById("standaloneAudioStylePrefixInput").value = document.getElementById("audioStylePrefixInput").value;
    document.getElementById("standaloneAudioModeSelect").value = document.getElementById("audioModeSelect").value === "per-sentence" ? "per-sentence" : "all-in-one";
    document.getElementById("standaloneAudioStatus").textContent = "تم نسخ إعدادات المرحلة الرابعة إلى الاستوديو المستقل.";
  }
  function upsertFailedAudioBatch(batchMeta) {
    if (!batchMeta?.id) return;
    const existingIndex = failedAudioBatches.findIndex((item) => item.id === batchMeta.id);
    const payload = { ...batchMeta, lastUpdatedAt: Date.now() };
    if (existingIndex >= 0) failedAudioBatches[existingIndex] = payload;
    else failedAudioBatches.push(payload);
    renderFullProjectAudioPreview();
  }
  function clearFailedAudioBatch(batchId) {
    const next = failedAudioBatches.filter((item) => item.id !== batchId);
    if (next.length !== failedAudioBatches.length) {
      failedAudioBatches = next;
      renderFullProjectAudioPreview();
    }
  }
  async function generateAudioForBatch(batchMeta, input, apiKeys, statusEl) {
    const stylePrefix = normalizeText(document.getElementById("audioStylePrefixInput").value);
    const autoVoice = normalizeTtsVoice((input.audioVoice === "auto") ? (projectTtsVoice || "Kore") : input.audioVoice);
    const narrations = (batchMeta.texts || []).map((text) => String(text || "").trim()).filter(Boolean);
    if (!narrations.length) throw new Error("EMPTY_AUDIO_BATCH");
    const combinedText = stylePrefix
      ? `${stylePrefix}\n\n${narrations.join(ttsSceneSeparator())}`
      : narrations.join(ttsSceneSeparator());
    const base64Data = await callGeminiTts(combinedText, autoVoice, input.audioModel, apiKeys, statusEl);
    const { samples, sampleRate } = await decodePcmBase64ToFloat32(base64Data);
    const charCounts = narrations.map((n) => n.length || 1);
    const segments = batchMeta.sceneIndexes.length === 1
      ? [samples]
      : await alignedOrRatioSplit(samples, sampleRate, charCounts, narrations);
    return {
      samples,
      sampleRate,
      fullAudioArtifact: createAudioArtifactFromSamples(samples, sampleRate),
      sceneArtifacts: batchMeta.sceneIndexes.map((sceneIndex, localIndex) => ({
        sceneIndex,
        artifact: createAudioArtifactFromSamples(segments[localIndex] || segments[segments.length - 1] || samples, sampleRate)
      }))
    };
  }
  async function retryFailedAudioBatch(batchId) {
    const batchMeta = failedAudioBatches.find((item) => item.id === batchId);
    if (!batchMeta || !phaseOneProject?.scenes?.length) return;
    const input = getProjectInput();
    const apiKeys = getGeminiApiKeys();
    if (!apiKeys.length) { alert("أضف مفاتيح Gemini API أولًا."); return; }
    clearStopRequest();
    beginManagedOperation();
    const status = document.getElementById("pipelineStatus");
    try {
      status.textContent = `إعادة محاولة ${batchMeta.label || "دفعة صوتية"}...`;
      const result = await generateAudioForBatch(batchMeta, input, apiKeys, status);
      result.sceneArtifacts.forEach(({ sceneIndex, artifact }) => {
        sceneAudios[sceneIndex] = artifact;
      });
      if (batchMeta.kind === "single-request") {
        fullProjectAudio = result.fullAudioArtifact;
      }
      clearFailedAudioBatch(batchId);
      renderAssetList();
      checkProjectComplete();
      status.textContent = `نجحت إعادة محاولة ${batchMeta.label || "الدفعة الصوتية"}.`;
    } catch (error) {
      if (isStopError(error)) {
        status.textContent = "تم إيقاف إعادة محاولة الدفعة الصوتية.";
      } else {
        console.error(error);
        upsertFailedAudioBatch({ ...batchMeta, error: error.message });
        status.textContent = `فشلت إعادة محاولة ${batchMeta.label || "الدفعة الصوتية"}: ${error.message}`;
      }
    } finally {
      endManagedOperation();
    }
  }
  // ─── تعليمات Gemini ───────────────────────────────────────────────────────
  // ─── محرّر البرومبتات (قوالب قابلة للتعديل + حماية الرموز) ────────────────
  const PROMPT_OVERRIDE_KEY = "story_studio_v37_prompt_overrides";
  // مصدر البرومبتات الخارجي على GitHub عبر jsDelivr (عدّل prompts.json في المستودع لتغييرها)
  const REMOTE_PROMPTS_URL = "https://cdn.jsdelivr.net/gh/cazanova971/Metaplus8@main/prompts.json";
  const PROMPT_JSON_PHASE1 = "{\"concept\":{\"title\":\"\",\"language\":\"\",\"era\":\"\",\"genre\":\"\",\"narrator_persona\":\"\",\"logline\":\"\",\"tone\":\"\",\"world\":\"\",\"core_conflict\":\"\",\"writing_style\":\"\",\"audience_selected\":\"\"},\"bible\":{\"main_character_profile\":\"\",\"supporting_cast\":\"\",\"world_rules\":\"\",\"visual_identity\":\"\",\"continuity_rules\":\"\",\"narrative_goal\":\"\"},\"story\":{\"story_summary\":\"\",\"full_story\":\"\"},\"scenes\":[{\"scene_number\":1,\"title\":\"\",\"duration_seconds\":5,\"narration\":\"\"}]}";
  const PROMPT_JSON_PHASE2 = "{\"scene_packs\":[{\"scene_number\":1,\"title\":\"\",\"duration_seconds\":5,\"visual_prompt\":\"\",\"motion_prompt\":\"\",\"camera_direction\":\"\",\"continuity_notes\":\"\"}]}";
  const PROMPT_JSON_PHASE3 = "{\"scene_assets\":[{\"scene_number\":1,\"title\":\"\",\"duration_seconds\":5,\"final_image_prompt\":\"\",\"motion_file_text\":\"\",\"camera_direction\":\"\",\"continuity_notes\":\"\"}]}";
  const PROMPT_LABELS = { phase1: "تعليمات القصة (المرحلة 1)", phase1own: "تعليمات نصّك المرفوع (المرحلة 1)", phase2: "تعليمات الإنتاج (المرحلة 2)", phase3: "تعليمات خطة الصور (المرحلة 3)" };
  const PROMPT_TEMPLATES_DEFAULT = {
    phase1: "You are a cinematic story development system. CRITICAL: The story title is \"{title}\" — EVERY element (concept, characters, world, conflict, all scenes) MUST be built around this exact title. Do not alter, ignore, or replace it. {creativeChoiceInstr} {religiousRespectInstr} HOOK (SCENE 1): The very first scene MUST be a powerful attention-grabbing hook — dramatic, thought-provoking, or emotionally compelling — strong enough to capture the viewer within the first 20 seconds and compel them to keep watching. Write ALL narration text in {language} using the {dialect} register. {audienceInstr} Automatically determine: story era/time period, writing style, and main character(s) — based on the title, genre, and narrator persona. Do NOT use generic defaults. Reflect your choices in the concept JSON fields. {hookLine} Target story length: {wordCount} words total across all narration (strict range: {minWords}–{maxWords} words). Scene division: each scene must have exactly 9-14 words of narration (= 4-5 seconds). Auto-calculate scene count from word count — do NOT use a fixed number. Estimated: ~{estimatedScenes} scenes. Each scene narration: exactly 9-14 words. Never shorter. Never longer. Return valid JSON ONLY. No markdown. No explanation. Complete in one response. Return exactly this JSON shape: {jsonShape}",
    phase1own: "You are a cinematic story development system working from an EXISTING user-provided text (a story or an article). DO NOT invent a new story — your job is to adapt and structure THIS exact text. {titleInstr} {creativeChoiceInstr} {religiousRespectInstr} {audienceInstr} Write ALL output text in {language} using the {dialect} register. If the source is already in this language, keep its wording according to the processing mode rules. {modeInstr} From the source text also build, derived STRICTLY from its content (never invented): a concept (logline, tone, era/setting, writing_style inferred from the text) and a story bible (main_character_profile, supporting_cast, world_rules, visual_identity, continuity_rules, narrative_goal) — so the later image and audio stages stay visually consistent. Put the full source-based story into story.full_story and a short summary into story.story_summary. Each scene must have: scene_number, title, duration_seconds (4-5), narration. Return valid JSON ONLY. No markdown. No explanation. Complete in one response. Return exactly this JSON shape: {jsonShape} SOURCE TEXT (between the triple quotes):\n\"\"\"\n{sourceText}\n\"\"\"",
    phase2: "You are a cinematic production planner for AI-driven video generation. Write all explanatory text in {language}. Return valid JSON only. No markdown. Complete ALL scenes in one response. Story title: {title}. Genre: {genre}. Era: {era}. Writing style: {writingStyle}. Tone: {tone}. Narrator persona: {narratorPersona}. Target audience: {audienceSelected}. Main character: {mainCharacter}. Visual identity: {visualIdentity}. Continuity rules: {continuityRules}. Full story: {fullStory}. Scenes: {scenesJson}. For EACH scene produce a complete production pack: VISUAL PROMPT RULES (MANDATORY): 1. DO NOT include any art style label or rendering style keyword at the beginning or anywhere else unless it is essential to scene content. The frontend injects the user-selected style automatically, so focus on subject, composition, lighting, mood, environment, framing, and detail only. 2. PROPHET/MESSENGER RULE: If any Prophet or Messenger of God appears in the scene (e.g. Moses, Jesus, Muhammad, Ibrahim, Yusuf, or any نبي/رسول), their face MUST NOT be depicted. Replace the face area with a radiant divine light (glowing halo of white/golden light emanating from where the face would be). Describe the body, silhouette, and surroundings normally. 3. Include: lighting type and direction, mood/atmosphere, color palette, character positioning and expression, environment details (foreground/background/textures), time of day or light source, camera angle and framing (close-up/wide/bird-eye/etc), depth of field. MOTION PROMPT (English only, detailed): include — camera movement type (slow pan left/right, zoom in/out, dolly forward/backward, tilt up/down, crane shot, static hold), subject motion (character gestures/actions, object movement, crowd movement), movement speed (very slow/slow/medium/fast/rapid), key scene interactions (fabric movement, door opening, page turning, reflections shifting, practical lights changing), lighting transitions (flickering, fading, dawn light rising). Avoid atmospheric filler such as dust, dirt, debris, smoke, fog, haze, ash, floating particles, and sand swirls unless absolutely essential to the main story action. MOTION — PROPHET/MESSENGER RULE: If a Prophet or Messenger appears, the motion must emphasize the divine light on the face area (gentle pulsing glow, soft light rays expanding, ethereal shimmer) — never direct the camera to reveal or focus on a face. CAMERA DIRECTION: specific cinematography instruction for this exact shot. CONTINUITY NOTES: what visual elements must remain consistent with surrounding scenes (character appearance, lighting direction, set dressing). Return exactly: {jsonShape}",
    phase3: "You are finalizing scene assets before image rendering. Write explanatory text in {language}. Return valid JSON only with no markdown. Story title: {title}. Genre: {genre}. Era: {era}. Main character profile: {mainCharacterProfile}. Visual identity: {visualIdentity}. Continuity rules: {continuityRules}. Scenes: {scenesJson}. Production packs: {packsJson}. Complete the non-image part of phase three in one response before any image generation starts. For each scene create a final image prompt, a final motion file text, a camera direction, and continuity notes. The final image prompt must be in English only and optimized for image generation. CRITICAL STRUCTURE: (a) DO NOT include any art style keyword in final_image_prompt. The frontend injects the selected style automatically, so write only scene content, composition, lighting, mood, camera, and environment details. (b) PROPHET/MESSENGER RULE: if a Prophet or Messenger appears, replace their face with radiant divine light (glowing white/golden halo where the face would be) — never depict the face directly. {motionInstr} Return exactly this shape: {jsonShape}"
  };
  let promptOverrides = {};
  function loadPromptOverrides() {
    try { promptOverrides = JSON.parse(localStorage.getItem(PROMPT_OVERRIDE_KEY) || "{}") || {}; }
    catch (e) { promptOverrides = {}; }
  }
  function savePromptOverrides() { try { localStorage.setItem(PROMPT_OVERRIDE_KEY, JSON.stringify(promptOverrides)); } catch (e) {} }
  // تحميل البرومبتات من GitHub (jsDelivr). لو فشل لأي سبب → تظل النسخة المدمجة fallback.
  // مصدر الإعدادات الخارجي (الاستايلات/التسميات) على GitHub عبر jsDelivr
  const REMOTE_CONFIG_URL = "https://cdn.jsdelivr.net/gh/cazanova971/Metaplus8@main/config.json";
  async function loadRemoteConfig() {
    try {
      const res = await fetch(REMOTE_CONFIG_URL, { cache: "no-cache" });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.imageStyleMap && typeof data.imageStyleMap === "object") {
        IMAGE_STYLE_MAP = Object.assign({}, IMAGE_STYLE_MAP, data.imageStyleMap);
      }
      if (data && data.styleTestLabels && typeof data.styleTestLabels === "object") {
        STYLE_TEST_LABELS = Object.assign({}, STYLE_TEST_LABELS, data.styleTestLabels);
        if (typeof populateStyleTestCheckboxes === "function") populateStyleTestCheckboxes();
      }
    } catch (e) { /* fallback = القيم المدمجة */ }
  }
  async function loadRemotePrompts() {
    if (!REMOTE_PROMPTS_URL || REMOTE_PROMPTS_URL.indexOf("USERNAME") !== -1) return; // لم يُضبط الرابط بعد
    try {
      const res = await fetch(REMOTE_PROMPTS_URL, { cache: "no-cache" });
      if (!res.ok) return;
      const data = await res.json();
      let applied = 0;
      ["phase1", "phase1own", "phase2", "phase3"].forEach((k) => {
        if (typeof data[k] === "string" && data[k].trim() && !missingTokens(k, data[k]).length) {
          PROMPT_TEMPLATES_DEFAULT[k] = data[k]; // النسخة البعيدة تصبح الافتراضية
          applied++;
        }
      });
      if (applied) {
        renderPromptsEditor();
        updateAiProviderStatus("تم تحميل " + applied + " برومبت من GitHub ✓");
      }
    } catch (e) { /* fallback = النسخة المدمجة */ }
  }
  function getPromptOverride(key) { return (promptOverrides && promptOverrides[key]) ? promptOverrides[key] : ""; }
  function getActivePromptText(key) { return getPromptOverride(key) || PROMPT_TEMPLATES_DEFAULT[key] || ""; }
  function requiredTokensOf(key) {
    const def = PROMPT_TEMPLATES_DEFAULT[key] || "";
    const set = new Set();
    (def.match(/\{[a-zA-Z0-9_]+\}/g) || []).forEach((t) => set.add(t));
    return Array.from(set);
  }
  function missingTokens(key, text) {
    const t = String(text || "");
    return requiredTokensOf(key).filter((tok) => t.indexOf(tok) === -1);
  }
  function renderPromptTemplate(tpl, tokens) {
    let out = String(tpl || "");
    for (const k in tokens) { if (Object.prototype.hasOwnProperty.call(tokens, k)) { out = out.split("{" + k + "}").join(tokens[k] == null ? "" : String(tokens[k])); } }
    out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n");
    return out.trim();
  }
  function setPromptStatus(key, msg, ok) {
    const el = document.getElementById("promptStatus-" + key);
    if (!el) return;
    el.style.display = msg ? "block" : "none";
    el.style.color = ok ? "var(--ok)" : "var(--danger)";
    el.textContent = msg || "";
  }
  function savePromptFromEditor(key) {
    const ta = document.getElementById("promptEditor-" + key);
    if (!ta) return;
    const text = ta.value;
    const miss = missingTokens(key, text);
    if (miss.length) { setPromptStatus(key, "يجب وضع الرموز التالية قبل الحفظ: " + miss.join("  "), false); return; }
    if (text.trim() === String(PROMPT_TEMPLATES_DEFAULT[key]).trim()) { delete promptOverrides[key]; }
    else { promptOverrides[key] = text; }
    savePromptOverrides();
    setPromptStatus(key, "تم الحفظ ✓ (هذا البرومبت سيُستخدم في التوليد)", true);
  }
  function revertPrompt(key) {
    delete promptOverrides[key];
    savePromptOverrides();
    const ta = document.getElementById("promptEditor-" + key);
    if (ta) ta.value = PROMPT_TEMPLATES_DEFAULT[key] || "";
    setPromptStatus(key, "تمت العودة إلى النص الأصلي ✓", true);
  }
  async function improvePromptWithGemini(key) {
    const ta = document.getElementById("promptEditor-" + key);
    const goalEl = document.getElementById("promptGoal-" + key);
    if (!ta) return;
    const current = ta.value;
    const goal = goalEl ? normalizeText(goalEl.value) : "";
    const tokens = requiredTokensOf(key);
    const meta = [
      "You are an expert prompt engineer. Improve the following instruction prompt used to drive an AI generation system.",
      goal ? ("Improvement goal from the user: " + goal + ".") : "Make it clearer, more precise and more effective, without changing its purpose.",
      "STRICT RULES:",
      "1. You MUST keep these placeholder tokens EXACTLY as written, do not remove, rename, translate, or alter any of them: " + tokens.join(" , ") + ".",
      "2. Keep the same overall purpose, output language expectations, and the required JSON output instruction.",
      "3. Return ONLY the improved prompt text. No explanations, no markdown code fences.",
      "PROMPT TO IMPROVE:\n" + current
    ].join("\n");
    setPromptStatus(key, "جارٍ التحسين عبر Gemini...", true);
    try {
      let out = await generateTextWithGemini(meta, "light");
      out = String(out || "").replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
      const miss = missingTokens(key, out);
      if (miss.length) { setPromptStatus(key, "Gemini حذف رموزًا مطلوبة (" + miss.join("  ") + ") — لم يتم التطبيق. حاول مجددًا.", false); return; }
      ta.value = out;
      setPromptStatus(key, "تم تحسين البرومبت ✓ راجِعه ثم اضغط حفظ.", true);
    } catch (e) {
      console.error(e);
      setPromptStatus(key, "تعذّر التحسين: " + (e && e.message ? e.message : e), false);
    }
  }
  function exportPrompts() {
    const data = {};
    ["phase1","phase1own","phase2","phase3"].forEach((k) => { data[k] = getActivePromptText(k); });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    saveAs(blob, "story_studio_prompts.json");
  }
  function importPrompts(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}")) || {};
        let applied = 0, rejected = [];
        ["phase1","phase1own","phase2","phase3"].forEach((k) => {
          if (typeof data[k] === "string" && data[k].trim()) {
            if (missingTokens(k, data[k]).length) { rejected.push(PROMPT_LABELS[k]); }
            else { if (data[k].trim() === String(PROMPT_TEMPLATES_DEFAULT[k]).trim()) delete promptOverrides[k]; else promptOverrides[k] = data[k]; applied++; }
          }
        });
        savePromptOverrides();
        renderPromptsEditor();
        alert("تم استيراد " + applied + " برومبت." + (rejected.length ? ("\nمرفوض (رموز ناقصة): " + rejected.join("، ")) : ""));
      } catch (e) { alert("ملف غير صالح: " + (e && e.message ? e.message : e)); }
    };
    reader.readAsText(file, "UTF-8");
    event.target.value = "";
  }
  function renderPromptsEditor() {
    const host = document.getElementById("promptsEditorList");
    if (!host) return;
    host.innerHTML = ["phase1","phase1own","phase2","phase3"].map((key) => {
      const text = getActivePromptText(key);
      const toks = requiredTokensOf(key).join("  ");
      const overridden = getPromptOverride(key) ? " (معدّل)" : "";
      return '<div class="prompt-block">' +
        '<div class="prompt-title">' + (PROMPT_LABELS[key] || key) + overridden + '</div>' +
        '<div class="prompt-tokens">رموز إلزامية: ' + toks + '</div>' +
        '<textarea id="promptEditor-' + key + '" class="prompt-textarea" spellcheck="false">' + text.replace(/</g, "&lt;") + '</textarea>' +
        '<div class="prompt-goal"><input type="text" id="promptGoal-' + key + '" placeholder="هدف التحسين (اختياري) — مثال: اجعله أكثر إثارة"></div>' +
        '<div class="prompt-actions">' +
          '<button class="btn btn-primary" type="button" onclick="improvePromptWithGemini(\'' + key + '\')">تحسين بـ Gemini</button>' +
          '<button class="btn btn-secondary" type="button" onclick="savePromptFromEditor(\'' + key + '\')">حفظ</button>' +
          '<button class="btn btn-ghost" type="button" onclick="revertPrompt(\'' + key + '\')">العودة للأصل</button>' +
        '</div>' +
        '<div id="promptStatus-' + key + '" class="prompt-status" style="display:none;"></div>' +
      '</div>';
    }).join("");
  }
  function switchSettingsTab(name) {
    const g = document.getElementById("settingsTabGeneral");
    const p = document.getElementById("settingsTabPrompts");
    if (g) g.style.display = (name === "prompts") ? "none" : "block";
    if (p) p.style.display = (name === "prompts") ? "block" : "none";
    document.querySelectorAll(".settings-subtab").forEach((b) => b.classList.toggle("active", b.dataset.stab === name));
    if (name === "prompts") renderPromptsEditor();
  }
  function getPhaseOneInstruction(input) {
    const minWords = Math.floor(input.wordCount * 0.9);
    const maxWords = Math.ceil(input.wordCount * 1.1);
    const estimatedScenes = Math.round(input.wordCount / 11);
    const availableGenres = getSelectOptionValues("storyGenreSelect");
    const availableNarrators = getSelectOptionValues("narratorSelect");
    const religiousCuePattern = /(الله|لله|سبحان الله|الحمد لله|بفضل الله|إن شاء الله|دعاء|إسلام|اسلام|ديني|قرآن|القران|سنة|السن[ةه]|صحابي|صحابة|نبي|رسول|هود|موسى|عيسى|إبراهيم|يوسف|محمد)/i;
    const isReligiousStory = input.genre === "Islamic" || religiousCuePattern.test(`${input.title} ${input.hook}`);
    const audienceInstr = input.audience === "auto"
      ? "Automatically select the most fitting target audience based on the story title, genre, and tone — and include it in audience_selected."
      : `Target audience: ${input.audience}. Write in a way that perfectly matches this audience's level and interests.`;
    const religiousRespectInstr = isReligiousStory
      ? `RELIGIOUS RESPECT (MANDATORY FOR THIS STORY): In Arabic text, mention Allah with full reverence when naturally relevant. For any Prophet use "نبي الله [name]" or "رسول الله [name]". For any Companion (Sahabi) add "رضي الله عنه / رضي الله عنها / رضي الله عنهم" as appropriate. Apply consistently throughout this religious story without sounding repetitive or forced.`
      : `RELIGIOUS REFERENCES (CONTROLLED): This is NOT primarily a religious story unless the plot itself requires it. Do NOT repeatedly mention Allah, supplications, or devotional phrases in ordinary historical/adventure narration. Only use religious wording when a prophet, companion, explicit Islamic event, or clearly religious context genuinely appears in the content.`;
    const creativeChoiceInstr = input.creativeAuto
      ? [
          `Auto-select the story genre from this allowed list only: ${availableGenres.join(", ")}.`,
          `Auto-select the narrator persona from this allowed list only: ${availableNarrators.join(", ")}.`,
          "Your selected genre must be written into concept.genre.",
          "Your selected narrator persona must be written into concept.narrator_persona and then used consistently in all narration."
        ].join(" ")
      : [
          `NARRATOR PERSONA: You are writing AS a "${input.narrator}". Fully adopt this narrator's voice, vocabulary, perspective, emotional register, and storytelling style in ALL narration text.`,
          `Genre: ${input.genre}.`
        ].join(" ");
    const _t1 = { title: input.title, creativeChoiceInstr: creativeChoiceInstr, religiousRespectInstr: religiousRespectInstr, language: input.language, dialect: input.dialect, audienceInstr: audienceInstr, hookLine: (input.hook ? ("Optional seed idea from user: " + input.hook + ".") : ""), wordCount: input.wordCount, minWords: minWords, maxWords: maxWords, estimatedScenes: estimatedScenes, jsonShape: PROMPT_JSON_PHASE1 };
    return renderPromptTemplate(getActivePromptText("phase1"), _t1);
  }
  // ─── المرحلة الأولى من نص يرفعه المستخدم (قصة/مقال جاهز) ──────────────────
  function getPhaseOneOwnStoryInstruction(input) {
    const text = input.ownStoryText;
    const isVerbatim = input.ownStoryMode === "verbatim";
    const availableGenres = getSelectOptionValues("storyGenreSelect");
    const availableNarrators = getSelectOptionValues("narratorSelect");
    const religiousCuePattern = /(الله|لله|سبحان الله|الحمد لله|بفضل الله|إن شاء الله|دعاء|إسلام|اسلام|ديني|قرآن|القران|سنة|السن[ةه]|صحابي|صحابة|نبي|رسول|هود|موسى|عيسى|إبراهيم|يوسف|محمد)/i;
    const isReligiousStory = input.genre === "Islamic" || religiousCuePattern.test(`${input.title} ${text.slice(0, 2000)}`);
    const titleInstr = input.title
      ? `CRITICAL: Use this exact story title: "${input.title}" — write it into concept.title.`
      : "Derive a fitting, compelling title from the provided source text and write it into concept.title.";
    const audienceInstr = input.audience === "auto"
      ? "Automatically select the most fitting target audience based on the source text — include it in audience_selected."
      : `Target audience: ${input.audience}. Match this audience's level and interests.`;
    const creativeChoiceInstr = input.creativeAuto
      ? [
          `Auto-select the story genre from this allowed list only: ${availableGenres.join(", ")}.`,
          `Auto-select the narrator persona from this allowed list only: ${availableNarrators.join(", ")}.`,
          "Write your selected genre into concept.genre and your selected narrator persona into concept.narrator_persona.",
          "Infer both strictly from the source text — do not contradict its content."
        ].join(" ")
      : [
          `NARRATOR PERSONA: ${input.narrator}. Adopt this voice in any narration you produce.`,
          `Genre: ${input.genre}.`
        ].join(" ");
    const religiousRespectInstr = isReligiousStory
      ? `RELIGIOUS RESPECT (MANDATORY): In Arabic text, mention Allah with full reverence when naturally relevant. For any Prophet use "نبي الله [name]" or "رسول الله [name]". For any Companion (Sahabi) add "رضي الله عنه / رضي الله عنها / رضي الله عنهم" as appropriate. Apply consistently without sounding forced.`
      : `RELIGIOUS REFERENCES (CONTROLLED): Do NOT add devotional phrases that are not present in the source text unless a clearly religious context genuinely appears in it.`;
    const modeInstr = isVerbatim
      ? [
          "PROCESSING MODE = VERBATIM PRESERVATION:",
          "The narration of every scene MUST reuse the user's EXACT words and sentences from the SOURCE TEXT.",
          "Do NOT rewrite, paraphrase, summarize, translate, add, or remove meaning. Your ONLY job is to split the existing text into sequential scenes.",
          "Split at natural sentence boundaries. Aim for 9-14 words per scene, but NEVER alter wording to hit that range — a scene may be shorter or longer if the original sentence requires it.",
          "Keep the original order. Cover the ENTIRE source text with no omissions and no additions."
        ].join(" ")
      : [
          "PROCESSING MODE = CINEMATIC ENHANCEMENT:",
          "Reshape the SOURCE TEXT into short cinematic narration scenes of 9-14 words each (= 4-5 seconds).",
          "You MAY lightly rephrase for flow and impact, but you MUST stay faithful to the original meaning, facts, characters, events, and order. Do NOT invent a new plot or add events not present in the source.",
          "Preserve the overall length and substance of the source — do not heavily summarize or pad.",
          "Make scene 1 a strong attention-grabbing hook drawn from the source."
        ].join(" ");
    const _t1o = { titleInstr: titleInstr, creativeChoiceInstr: creativeChoiceInstr, religiousRespectInstr: religiousRespectInstr, audienceInstr: audienceInstr, language: input.language, dialect: input.dialect, modeInstr: modeInstr, sourceText: text, jsonShape: PROMPT_JSON_PHASE1 };
    return renderPromptTemplate(getActivePromptText("phase1own"), _t1o);
  }
  function getPhaseTwoInstruction(project) {
    const _t2 = { language: project.language, title: project.title, genre: project.genre, era: (project.concept && project.concept.era) || "", writingStyle: (project.concept && project.concept.writing_style) || "", tone: (project.concept && project.concept.tone) || "", narratorPersona: project.narratorPersona || "", audienceSelected: (project.concept && project.concept.audience_selected) || "", mainCharacter: project.bible.main_character_profile, visualIdentity: project.bible.visual_identity, continuityRules: project.bible.continuity_rules, fullStory: project.story.full_story, scenesJson: JSON.stringify(project.scenes), jsonShape: PROMPT_JSON_PHASE2 };
    return renderPromptTemplate(getActivePromptText("phase2"), _t2);
  }
  function getPhaseThreeInstruction(project, packs, options = {}) {
    const preserveMotionDetail = options.preserveMotionDetail !== false;
    const _motionInstr = preserveMotionDetail ? "For motion_file_text, preserve the detail already present in the original motion_prompt from the production packs. Do NOT shorten it. Refine wording only when needed for clarity and production-readiness. Keep camera movement, subject movement, speed, lighting transitions, and essential scene interactions. Do not add atmospheric filler such as dust, dirt, debris, smoke, fog, haze, ash, floating particles, or sand swirls." : "The final motion file text may be concise, but it must still preserve the essential camera movement, subject motion, speed, lighting transitions, and key scene interactions. Do not add atmospheric filler such as dust, dirt, debris, smoke, fog, haze, ash, floating particles, or sand swirls.";
    const _t3 = { language: project.language, title: project.title, genre: project.genre, era: project.era, mainCharacterProfile: project.bible.main_character_profile, visualIdentity: project.bible.visual_identity, continuityRules: project.bible.continuity_rules, scenesJson: JSON.stringify(project.scenes), packsJson: JSON.stringify(packs), motionInstr: _motionInstr, jsonShape: PROMPT_JSON_PHASE3 };
    return renderPromptTemplate(getActivePromptText("phase3"), _t3);
  }
  // ─── البطاقات ─────────────────────────────────────────────────────────────
  function loadCardState() {
    try { return JSON.parse(localStorage.getItem(CARD_STATE_STORAGE_KEY) || "{}") || {}; }
    catch (error) { return {}; }
  }
  function persistCardState() {
    localStorage.setItem(CARD_STATE_STORAGE_KEY, JSON.stringify(cardState));
  }
  function setCardCollapsed(cardKey, collapsed) {
    const card = document.querySelector(`[data-card-key="${cardKey}"]`);
    const body = document.getElementById(`card-body-${cardKey}`);
    const icon = document.getElementById(`card-toggle-icon-${cardKey}`);
    const text = document.getElementById(`card-toggle-text-${cardKey}`);
    if (!card || !body || !icon || !text) return;
    card.classList.toggle("collapsed", collapsed);
    body.hidden = collapsed;
    icon.textContent = collapsed ? "▸" : "▾";
    text.textContent = collapsed ? "إظهار" : "إخفاء";
    cardState[cardKey] = collapsed;
    persistCardState();
  }
  function toggleCard(cardKey) {
    setCardCollapsed(cardKey, !cardState[cardKey]);
  }
  function initializeCards() {
    cardState = loadCardState();
    document.querySelectorAll("[data-card-key]").forEach((card) => {
      const cardKey = card.getAttribute("data-card-key");
      setCardCollapsed(cardKey, Boolean(cardState[cardKey]));
    });
  }
  function autoCollapseCards(cardKeys) {
    cardKeys.forEach((cardKey) => setCardCollapsed(cardKey, true));
  }
  // ─── مراحل التقدم ─────────────────────────────────────────────────────────
  function getShapeConfig() {
    const [width, height] = document.getElementById("shapeSelect").value.split("x").map(Number);
    return { width, height, resolution: `${width}x${height}` };
  }
  // ─── اختبار الاستايلات: نفس البرومبت بكل الاستايلات للمقارنة والاختيار ──────
  let styleTestItems = [];
  let STYLE_TEST_LABELS = {};
  function populateStyleTestCheckboxes() {
    const box = document.getElementById("styleTestCheckboxes");
    if (!box) return;
    box.innerHTML = Object.keys(IMAGE_STYLE_MAP).map((key) => `
      <label class="toggle-row" style="margin-bottom:6px;gap:8px;">
        <input type="checkbox" class="style-test-check" value="${key}" checked style="width:auto;">
        <span>${STYLE_TEST_LABELS[key] || key}</span>
      </label>
    `).join("");
  }
  function toggleAllStyleChecks(on) {
    document.querySelectorAll(".style-test-check").forEach((c) => { c.checked = on; });
  }
  function getSelectedStyleKeys() {
    return Array.from(document.querySelectorAll(".style-test-check")).filter((c) => c.checked).map((c) => c.value);
  }
  function useScene1PromptForStyleTest() {
    const fromAssets = (sceneAssets[0] && !sceneAssets[0].placeholder) ? sceneAssets[0].finalPrompt : "";
    const p = fromAssets || productionPack[0]?.visual_prompt || phaseOneProject?.scenes?.[0]?.narration || "";
    if (!p) { alert("لا يوجد مشهد جاهز بعد. نفّذ المراحل أولًا أو اكتب برومبت يدويًا."); return; }
    const ta = document.getElementById("styleTestPromptInput");
    if (ta) ta.value = stripLeadingStyleDirectives(p);
  }
  function _styleTestShape() {
    // حجم معتمد ثابت لاختبار الاستايلات (يتوافق مع بلجن الصور في Perchance)
    return { width: 512, height: 768, resolution: "512x768" };
  }
  function renderStyleTestResults() {
    const grid = document.getElementById("styleTestResults");
    if (!grid) return;
    if (!styleTestItems.length) {
      grid.innerHTML = `<div class="hint">اكتب برومبت واضغط «اختبر الاستايلات» لتوليد نفس الصورة بكل استايل ثم المقارنة والاختيار.</div>`;
      return;
    }
    grid.innerHTML = styleTestItems.map((item) => `
      <article class="asset-card">
        <div class="asset-image">
          ${item.imageData
            ? `<img src="${item.imageData}" alt="${item.label}">`
            : item.error
              ? `<div class="hint" style="text-align:center;padding:14px;color:var(--danger);">فشل التوليد</div>`
              : `<div class="spinner"></div>`}
        </div>
        <div class="asset-body">
          <div class="scene-head">
            <div class="scene-title">${item.label}</div>
            <div class="scene-meta">${item.error ? "⚠ خطأ" : item.imageData ? "✓ جاهز" : "⏳"}</div>
          </div>
          <div class="asset-actions">
            <button class="small-btn" type="button" onclick="selectStyleFromTest('${item.key}')">اختر هذا الاستايل</button>
          </div>
        </div>
      </article>
    `).join("");
  }
  function selectStyleFromTest(key) {
    const sel = document.getElementById("imageStyleSelect");
    if (sel) sel.value = key;
    const status = document.getElementById("styleTestStatus");
    if (status) status.textContent = `تم اختيار الاستايل: ${STYLE_TEST_LABELS[key] || key} ✓ (سيُستخدم في توليد الصور)`;
  }
  async function runStyleTest() {
    const ta = document.getElementById("styleTestPromptInput");
    const statusEl = document.getElementById("styleTestStatus");
    const testPrompt = (ta?.value || "").trim();
    if (!testPrompt) { alert("اكتب برومبت الاختبار أولًا."); return; }
    const keys = getSelectedStyleKeys();
    if (!keys.length) { alert("اختر استايل واحد على الأقل."); return; }
    clearStopRequest();
    beginManagedOperation();
    const model = document.getElementById("imageModelSelect").value || "flux-schnell";
    const shape = _styleTestShape();
    styleTestItems = keys.map((key) => ({ key, label: STYLE_TEST_LABELS[key] || key, imageData: "", error: "" }));
    renderStyleTestResults();
    let done = 0;
    if (statusEl) statusEl.textContent = `جارٍ توليد ${keys.length} استايل (حجم مصغّر)...`;
    try {
      async function genOne(i) {
        throwIfStopRequested();
        const item = styleTestItems[i];
        const styleModifier = IMAGE_STYLE_MAP[item.key] || "";
        const prompt = [styleModifier, testPrompt, qualityPrompt].filter(Boolean).join(", ");
        try {
          const response = await t2i({
            prompt,
            negativePrompt: negativePromptBase,
            resolution: shape.resolution,
            width: shape.width,
            height: shape.height,
            model,
            seed: -1
          });
          throwIfStopRequested();
          // نفس تطبيع التوليد الرئيسي: تمرير ناتج t2i على canvas لإنتاج PNG ثابت (نفس مقاس الاختبار)
          const resizedUrl = await resizeImageNative(response.dataUrl, shape.width, shape.height, "stretch");
          styleTestItems[i] = { ...item, imageData: resizedUrl, error: "" };
        } catch (err) {
          if (isStopError(err)) throw err;
          console.error(err);
          styleTestItems[i] = { ...item, error: "failed" };
        }
        done++;
        if (statusEl) statusEl.textContent = `تم ${done} / ${keys.length}`;
        renderStyleTestResults();
      }
      const parallel = Math.min(getImageParallelLimit(), keys.length);
      let pos = 0;
      const workers = [];
      for (let w = 0; w < parallel; w++) {
        workers.push((async () => {
          while (pos < keys.length) {
            if (stopRequested) break;
            await genOne(pos++);
          }
        })());
      }
      await Promise.all(workers);
      if (statusEl) statusEl.textContent = stopRequested
        ? "تم إيقاف الاختبار."
        : `اكتمل اختبار ${keys.length} استايل — اختر الأنسب.`;
    } catch (err) {
      if (isStopError(err)) { if (statusEl) statusEl.textContent = "تم إيقاف الاختبار."; }
      else { console.error(err); if (statusEl) statusEl.textContent = "حدث خطأ أثناء اختبار الاستايلات."; }
    } finally {
      endManagedOperation();
    }
  }
  function getImageParallelLimit() {
    return Math.max(1, Number(document.getElementById("parallelImagesSelect").value) || 2);
  }
  function setCurrentPhase(label) {
    const chip = document.getElementById("currentPhaseChip");
    if (!chip) return;
    chip.textContent = `الآن: ${label || "جاهز للبداية"}`;
  }
  function setStage(stageKey, status, text) {
    const badge = document.getElementById(`badge-${stageKey}`);
    const desc = document.getElementById(`desc-${stageKey}`);
    const labels = { idle: "بانتظار", loading: "جاري التنفيذ", ok: "اكتمل", fail: "خطأ" };
    if (!badge) return;
    badge.textContent = labels[status] || labels.idle;
    badge.className = `badge ${status === "loading" ? "loading" : status === "ok" ? "ok" : status === "fail" ? "fail" : ""}`.trim();
    if (text && desc) desc.textContent = text;
  }
  // ─── عرض البيانات ─────────────────────────────────────────────────────────
  function renderSummary() {
    document.getElementById("summaryTitle").textContent = phaseOneProject?.title || "-";
    const lang = phaseOneProject?.language || "-";
    const dialect = phaseOneProject?.dialect || "";
    document.getElementById("summaryLanguage").textContent = dialect ? `${lang} / ${dialect.split("(")[0].trim()}` : lang;
    document.getElementById("summaryEra").textContent = phaseOneProject?.era || "-";
    document.getElementById("summaryScenes").textContent = phaseOneProject?.scenes?.length ? String(phaseOneProject.scenes.length) : "-";
  }
  function renderSceneList() {
    const list = document.getElementById("sceneList");
    if (!phaseOneProject?.scenes?.length) {
      list.innerHTML = `<div class="hint">ستظهر قائمة المشاهد هنا فور اكتمال مرحلة التقسيم.</div>`;
      return;
    }
    list.innerHTML = phaseOneProject.scenes.map((scene) => `
      <article class="scene-item">
        <div class="scene-head">
          <div class="scene-title">مشهد ${scene.scene_number}: ${scene.title}</div>
          <div class="scene-meta">${scene.duration_seconds || 5}s</div>
        </div>
        <div class="scene-text">${scene.narration}</div>
      </article>
    `).join("");
  }
  function renderProductionList() {
    const list = document.getElementById("productionList");
    if (!productionPack.length) {
      list.innerHTML = `<div class="hint">ستظهر هنا حزمة الإنتاج لكل مشهد بعد اكتمال المرحلة الثانية.</div>`;
      return;
    }
    list.innerHTML = productionPack.map((item) => `
      <article class="scene-item">
        <div class="scene-head">
          <div class="scene-title">مشهد ${item.scene_number}: ${item.title}</div>
          <div class="scene-meta">${item.duration_seconds || 5}s</div>
        </div>
        <div class="scene-pack">
          <div class="scene-pack-box"><strong>Visual Prompt</strong>\n${item.visual_prompt || ""}</div>
          <div class="scene-pack-box"><strong>Motion Prompt</strong>\n${item.motion_prompt || ""}</div>
          <div class="scene-pack-box"><strong>Camera Direction</strong>\n${item.camera_direction || ""}</div>
          <div class="scene-pack-box"><strong>Continuity Notes</strong>\n${item.continuity_notes || ""}</div>
        </div>
      </article>
    `).join("");
  }

  async function retrySceneImage(index) {
    if (!phaseOneProject || !sceneAssets[index]) return;
    if (sceneAssets[index].placeholder) {
      alert("لم تُولَّد الصور بعد. اضغط زر «مرحلة الصور» أولًا لتجهيز البرومبت النهائي ثم توليد الصور.");
      return;
    }
    clearStopRequest();
    beginManagedOperation();
    const btn = document.querySelector(`[onclick="retrySceneImage(${index})"]`);
    if (btn) { btn.disabled = true; btn.textContent = "⏳ جاري التوليد..."; }

    // امسح الخطأ وارجع للـ spinner
    sceneAssets[index] = { ...sceneAssets[index], imageData: "", error: "" };
    renderAssetList();

    const shape = getShapeConfig();
    const imageStyleKey = document.getElementById("imageStyleSelect").value;
    const imageStyleModifier = IMAGE_STYLE_MAP[imageStyleKey] || "";
    const model = document.getElementById("imageModelSelect").value || "flux-schnell";

    const asset = sceneAssets[index];
    try {
      throwIfStopRequested();
      const stylePrefix = imageStyleModifier ? `${imageStyleModifier}, ` : "";
      const promptBody = [
        stripLeadingStyleDirectives(asset.finalPrompt || ""),
        phaseOneProject?.bible?.main_character_profile || "",
        asset.continuityNotes || "",
        qualityPrompt
      ].filter(Boolean).join(", ");
      const response = await t2i({
        prompt: stylePrefix + promptBody,
        negativePrompt: negativePromptBase,
        resolution: shape.resolution,
        width: shape.width,
        height: shape.height,
        model,
        seed: -1
      });
      throwIfStopRequested();
      const resizedUrl = await resizeImage(response.dataUrl, shape.width, shape.height);
      sceneAssets[index] = { ...sceneAssets[index], imageData: resizedUrl, error: "" };
    } catch (err) {
      if (!isStopError(err)) {
        console.error(err);
        sceneAssets[index] = { ...sceneAssets[index], error: "generation_failed" };
        const status = document.getElementById("pipelineStatus");
        if (status) status.textContent = `فشل إعادة توليد صورة المشهد ${index + 1}. تحقق من موديل الصور أو مزود الصور.`;
      }
    }
    renderAssetList();
    updateDownloadBtn();
    endManagedOperation();
  }

  function renderAssetList() {
    const list = document.getElementById("assetList");
    renderFullProjectAudioPreview();
    if (!sceneAssets.length) {
      list.innerHTML = `<div class="hint">ستظهر هنا الصور وملفات الحركة بعد اكتمال المرحلة الثالثة.</div>`;
      return;
    }
    list.innerHTML = sceneAssets.map((asset, index) => {
      const scene = phaseOneProject?.scenes?.[index] || productionPack?.[index] || {};
      const audio = sceneAudios[index];
      const audioHtml = audio?.wavUrl
        ? `<div class="audio-player-wrap"><audio controls src="${audio.wavUrl}"></audio></div>`
        : audio?.error === "split_failed_full_audio_available"
          ? `<div class="audio-pending">تعذر تقطيع هذا المشهد، لكن الصوت الكامل متاح كنسخة احتياطية.</div>`
        : audio?.error
          ? `<div class="audio-pending" style="color:var(--danger);">فشل توليد الصوت</div>`
          : "";
      return `
        <article class="asset-card">
          <div class="asset-image">
            ${asset.imageData
              ? `<img src="${asset.imageData}" alt="${scene.title || `Scene ${index + 1}`}">`
              : asset.placeholder
                ? `<div class="hint" style="text-align:center;padding:14px;">🖼️ بانتظار توليد الصور<br>اضغط زر «مرحلة الصور»</div>`
                : `<div class="spinner"></div>`}
          </div>
          <div class="asset-body">
            <div class="scene-head">
              <div class="scene-title">مشهد ${scene.scene_number || index + 1}: ${scene.title || ""}</div>
              <div class="scene-meta">${asset.error ? "⚠ خطأ" : asset.imageData ? "✓ جاهز" : asset.placeholder ? "🖼️ بانتظار الصور" : "⏳ بانتظار"}</div>
            </div>
            <details class="asset-details">
              <summary>
                <span>تفاصيل المشهد</span>
                <span class="asset-details-icon">▾</span>
              </summary>
              <div class="asset-details-body">
                <div class="scene-pack">
                  <div class="scene-pack-box"><strong>Final Image Prompt</strong>\n${asset.finalPrompt || ""}</div>
                  <div class="scene-pack-box"><strong>Motion File</strong>\n${asset.motionText || ""}</div>
                  <div class="scene-pack-box"><strong>Camera Direction</strong>\n${asset.cameraDirection || ""}</div>
                  <div class="scene-pack-box"><strong>Continuity Notes</strong>\n${asset.continuityNotes || ""}</div>
                </div>
              </div>
            </details>
            ${audioHtml}
            ${scene.narration ? `<div class="scene-pack-box" style="margin-top:8px;"><strong>نص المشهد (للمطابقة مع الصوت)</strong>\n${scene.narration}</div>` : ""}
            <div class="asset-actions">
              ${asset.placeholder ? "" : `<button class="small-btn" onclick="downloadSceneImage(${index})">تحميل الصورة</button>`}
              <button class="small-btn" onclick="downloadSceneMotionFile(${index})">تحميل ملف الحركة</button>
              ${audio?.wavUrl ? `<button class="small-btn audio-btn" onclick="downloadSceneAudio(${index})">تحميل الصوت WAV</button>` : ""}
              ${asset.placeholder ? "" : `<button class="retry-img-btn" type="button" onclick="retrySceneImage(${index})" title="إعادة توليد الصورة" aria-label="إعادة توليد الصورة">↻</button>`}
            </div>
          </div>
        </article>
      `;
    }).join("");
  }
  function renderFullProjectAudioPreview() {
    const container = document.getElementById("fullProjectAudioPreview");
    if (!container) return;
    const failedBatchesHtml = failedAudioBatches.length ? `
      <article class="project-audio-standalone" style="margin-bottom:14px;">
        <div class="scene-head">
          <div class="scene-title">دفعات صوت فشلت</div>
          <div class="scene-meta">${failedAudioBatches.length} دفعة</div>
        </div>
        <div class="scene-pack">
          ${failedAudioBatches.map((batch) => `
            <div class="scene-pack-box">
              <strong>${batch.label || "دفعة صوتية"}</strong>
              \n${batch.error || "فشلت هذه الدفعة أثناء التوليد."}
              \nالمشاهد: ${(batch.sceneIndexes || []).map((index) => index + 1).join("، ")}
              \n<div class="asset-actions" style="margin-top:10px;"><button class="small-btn audio-btn" onclick="retryFailedAudioBatch('${batch.id}')">إعادة محاولة هذه الدفعة</button></div>
            </div>
          `).join("")}
        </div>
      </article>
    ` : "";
    if (!fullProjectAudio?.wavUrl) {
      container.innerHTML = `${failedBatchesHtml}<div class="hint">سيظهر هنا مشغّل الصوت الكامل بعد اكتمال توليد المرحلة الرابعة.</div>`;
      return;
    }
    container.innerHTML = `
      ${failedBatchesHtml}
      <article class="project-audio-standalone">
        <div class="scene-head">
          <div class="scene-title">الصوت النهائي الكامل</div>
          <div class="scene-meta">استماع مباشر قبل التنزيل</div>
        </div>
        <div class="audio-player-wrap"><audio controls src="${fullProjectAudio.wavUrl}"></audio></div>
        <div class="project-audio-note">هذا هو الملف الكامل النهائي للمشروع، ويمكنك مراجعته كاملًا هنا قبل تنزيله.</div>
        <div class="asset-actions">
          <button class="small-btn audio-btn" onclick="downloadFullProjectAudio()">تحميل الصوت الكامل WAV</button>
        </div>
      </article>
    `;
  }
  function updateDownloadBtn() {
    const allImgReady = sceneAssets.length > 0 && sceneAssets.every(a => a.imageData);
    document.getElementById("downloadProjectBtn").disabled = !allImgReady;
    checkProjectComplete();
  }
  function checkProjectComplete() {
    const allImgReady = sceneAssets.length > 0 && sceneAssets.every(a => a.imageData);
    const audioEnabled = document.getElementById("audioEnabledToggle").checked;
    const hasFullAudioFallback = Boolean(fullProjectAudio?.wavUrl);
    const allSceneAudiosReady = sceneAudios.length > 0 && sceneAudios.every(a => a && a.wavUrl);
    const allAudioReady = !audioEnabled || hasFullAudioFallback || allSceneAudiosReady;
    const done = allImgReady && allAudioReady;
    const btn = document.getElementById("fixedDownloadBtn");
    if (btn) btn.style.display = done ? "block" : "none";
  }
  function hasPhaseOneComplete() {
    return Boolean(phaseOneProject?.scenes?.length);
  }
  function hasPhaseTwoComplete() {
    return Boolean(productionPack.length);
  }
  function hasPhaseThreeComplete() {
    return Boolean(sceneAssets.length) && sceneAssets.every((asset) => asset?.imageData);
  }
  function hasPhaseFourComplete() {
    const audioEnabled = document.getElementById("audioEnabledToggle").checked;
    if (!audioEnabled) return true;
    return Boolean(fullProjectAudio?.wavUrl) || (sceneAudios.length > 0 && sceneAudios.every((audio) => audio?.wavUrl));
  }
  function getNextIncompletePhase() {
    if (!hasPhaseOneComplete()) return "story";
    if (!hasPhaseTwoComplete()) return "production";
    if (!hasPhaseThreeComplete()) return "assets";
    if (!hasPhaseFourComplete()) return "audio";
    return "done";
  }
  // ─── Pipelines ────────────────────────────────────────────────────────────
  function setPipelineButtonsDisabled(disabled) {
    document.getElementById("runAllBtn").disabled = disabled;
    document.getElementById("runResumeBtn").disabled = disabled;
    document.getElementById("runPipelineBtn").disabled = disabled;
    document.getElementById("runProductionBtn").disabled = disabled || !phaseOneProject?.scenes?.length;
    document.getElementById("runAssetsBtn").disabled = disabled || !productionPack.length;
    document.getElementById("runAudioBtn").disabled = disabled || !sceneAssets.length;
  }
  function resetProject() {
    phaseOneProject = null;
    productionPack = [];
    sceneAssets = [];
    sceneAudios = [];
    fullProjectAudio = { wavUrl: "", base64Data: "", error: "" };
    failedAudioBatches = [];
    phaseThreePlan = [];
    projectTtsStyle = "";
    projectTtsVoice = "";
    document.getElementById("audioStylePrefixInput").value = "Say in a warm, natural voice:";
    const _fdb = document.getElementById("fixedDownloadBtn"); if (_fdb) _fdb.style.display = "none";
    document.getElementById("pipelineStatus").textContent = "";
    setCurrentPhase("جاهز للبداية");
    document.getElementById("bibleOutput").textContent = "سيظهر هنا ملف الهوية السردية والشخصية الرئيسية بعد اكتمال هذه المرحلة.";
    document.getElementById("storyOutput").textContent = "سيظهر هنا نص القصة الكامل بعد التوليد.";
    document.getElementById("downloadProjectBtn").disabled = true;
    document.getElementById("runAllBtn").disabled = false;
    document.getElementById("runResumeBtn").disabled = false;
    document.getElementById("runPipelineBtn").disabled = false;
    document.getElementById("runProductionBtn").disabled = true;
    document.getElementById("runAssetsBtn").disabled = true;
    document.getElementById("runAudioBtn").disabled = true;
    renderSummary();
    renderSceneList();
    renderProductionList();
    renderAssetList();
    ["concept","bible","story","scenes"].forEach((k) => setStage(k, "idle", null));
    setStage("concept", "idle", "صياغة اتجاه القصة وعالمها الأولي.");
    setStage("bible", "idle", "بناء الشخصية الرئيسية وقواعد العالم ونبرة السرد.");
    setStage("story", "idle", "توليد النص الكامل للقصة.");
    setStage("scenes", "idle", "تقسيم القصة إلى مشاهد قصيرة جاهزة للمرحلة التالية.");
    setStage("pack", "idle", "بناء ملفات إنتاج لكل مشهد.");
    setStage("visual", "idle", "صياغة برومبتات الصور لكل مشهد.");
    setStage("motion", "idle", "صياغة برومبتات الحركة لكل مشهد.");
    setStage("continuity", "idle", "تثبيت الاستمرارية بين المشاهد.");
    setStage("images", "idle", "توليد صورة فعلية لكل مشهد.");
    setStage("motion-files", "idle", "تجهيز ملف الحركة النهائي لكل مشهد عبر Gemini.");
    setStage("preview", "idle", "عرض معاينة الأصول المنتجة داخل الواجهة.");
    setStage("export", "idle", "تجهيز حزمة المشروع النهائية للتنزيل.");
    setStage("audio-queue", "idle", "تجهيز قائمة جمل التعليق الصوتي.");
    setStage("audio-generate", "idle", "توليد الصوت بنظام الدُفعات أو جملة بجملة.");
    setStage("audio-preview", "idle", "عرض مشغّل الصوت لكل مشهد.");
    setStage("audio-export", "idle", "تضمين ملفات WAV في حزمة التنزيل.");
  }
  async function runStoryPipeline(options = {}) {
    const input = getProjectInput();
    const status = document.getElementById("pipelineStatus");
    const runBtn = document.getElementById("runPipelineBtn");
    if (input.useOwnStory) {
      if (!input.ownStoryText) { alert("ارفع ملف القصة أولًا، أو ألغِ خيار «عندي قصتي الخاصة»."); return false; }
    } else if (!input.title) {
      alert("اكتب عنوان القصة أولًا.");
      return false;
    }
    if (!options.skipReset) resetProject();
    if (!options.managedByRunAll) clearStopRequest();
    beginManagedOperation();
    runBtn.disabled = true;
    setCurrentPhase("المرحلة الأولى");
    status.textContent = input.useOwnStory
      ? "بدأ تحليل النص المرفوع وتجهيز المشاهد..."
      : "بدأ تنفيذ المرحلة الأولى المدمجة...";
    try {
      setStage("concept", "loading", input.useOwnStory ? "Gemini يحلل النص المرفوع..." : "Gemini يبني الفكرة الأساسية...");
      setStage("bible", "loading", "Gemini يبني الـ Story Bible...");
      setStage("story", "loading", input.useOwnStory ? "Gemini يجهّز نصك..." : "Gemini يكتب القصة الكاملة...");
      setStage("scenes", "loading", "Gemini يقسم المشاهد...");
      const phaseOneInstruction = input.useOwnStory
        ? getPhaseOneOwnStoryInstruction(input)
        : getPhaseOneInstruction(input);
      const parsed = safeParseJson(await generateTextWithGemini(phaseOneInstruction, "heavy"));
      const concept = parsed.concept || {};
      const bible = parsed.bible || {};
      const story = parsed.story || {};
      const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
      phaseOneProject = {
        title: concept.title || input.title,
        language: concept.language || input.language,
        dialect: input.dialect,
        era: concept.era || "",
        genre: concept.genre || input.genre,
        narratorPersona: concept.narrator_persona || input.narrator,
        audienceSelected: concept.audience_selected || input.audience,
        concept, bible, story, scenes
      };
      if (input.creativeAuto) {
        if (concept.genre) document.getElementById("storyGenreSelect").value = concept.genre;
        if (concept.narrator_persona) document.getElementById("narratorSelect").value = concept.narrator_persona;
      }
      setStage("concept", "ok", concept.logline || "تم توليد الفكرة الأساسية.");
      setStage("bible", "ok", "تم بناء الـ story bible وتثبيت هوية العالم والشخصية.");
      setStage("story", "ok", "تم توليد القصة الكاملة بنجاح.");
      setStage("scenes", "ok", `تم تقسيم القصة إلى ${scenes.length} مشاهد.`);
      document.getElementById("bibleOutput").textContent = [
        `Main Character Profile:\n${bible.main_character_profile || ""}`,
        `\nSupporting Cast:\n${bible.supporting_cast || ""}`,
        `\nWorld Rules:\n${bible.world_rules || ""}`,
        `\nVisual Identity:\n${bible.visual_identity || ""}`,
        `\nContinuity Rules:\n${bible.continuity_rules || ""}`,
        `\nNarrative Goal:\n${bible.narrative_goal || ""}`
      ].join("\n");
      document.getElementById("storyOutput").textContent = story.full_story || story.story_summary || "تم توليد القصة.";
      renderSummary();
      renderSceneList();
      // توليد أسلوب TTS ديناميكي
      try {
        status.textContent = "Gemini يُعد أسلوب التعليق الصوتي...";
        const ttsResult = await generateTtsStylePrompt(phaseOneProject, input);
        projectTtsStyle = ttsResult.style;
        projectTtsVoice = ttsResult.voice;
        document.getElementById("audioStylePrefixInput").value = projectTtsStyle;
        // عرض الصوت المختار في الـ UI لو الاختيار تلقائي
        if (document.getElementById("audioVoiceSelect").value === "auto" && projectTtsVoice) {
          updateAiProviderStatus(`Gemini اختار صوت: ${projectTtsVoice}`);
        }
      } catch(ttsErr) {
        console.warn("TTS style gen failed:", ttsErr);
        projectTtsStyle = "Read naturally and expressively, with appropriate emotional emphasis:";
        projectTtsVoice = "";
        document.getElementById("audioStylePrefixInput").value = projectTtsStyle;
      }
      if (!options.managedByRunAll) document.getElementById("runProductionBtn").disabled = false;
      autoCollapseCards(["phase-1-progress", "story-bible", "full-story"]);
      switchToTab("story");
      status.textContent = "اكتملت المرحلة الأولى + أسلوب الصوت جاهز.";
      return true;
    } catch (error) {
      if (isStopError(error)) {
        ["concept","bible","story","scenes"].forEach((k) => {
          const badge = document.getElementById(`badge-${k}`);
          if (badge?.classList.contains("loading")) setStage(k, "idle", "تم الإيقاف قبل اكتمال هذه الخطوة.");
        });
        status.textContent = "تم إيقاف المرحلة الأولى يدويًا.";
      } else {
        console.error(error);
        ["concept","bible","story","scenes"].forEach((k) => setStage(k, "fail", "فشل بناء المرحلة الأولى."));
        status.textContent = "حدث خطأ أثناء تنفيذ المرحلة الأولى. تحقق من إعدادات Gemini.";
      }
      return false;
    } finally {
      if (!options.managedByRunAll) runBtn.disabled = false;
      endManagedOperation();
    }
  }
  async function runProductionPipeline(options = {}) {
    const status = document.getElementById("pipelineStatus");
    const runProductionBtn = document.getElementById("runProductionBtn");
    if (!phaseOneProject?.scenes?.length) { alert("نفّذ المرحلة الأولى أولًا."); return false; }
    if (!options.managedByRunAll) clearStopRequest();
    beginManagedOperation();
    runProductionBtn.disabled = true;
    setCurrentPhase("المرحلة الثانية");
    status.textContent = "بدأ تنفيذ المرحلة الثانية المدمجة...";
    productionPack = [];
    sceneAssets = [];
    phaseThreePlan = [];
    renderProductionList();
    renderAssetList();
    try {
      ["pack","visual","motion","continuity"].forEach((k) => setStage(k, "loading", "Gemini يعمل في طلب واحد..."));
      const parsed = safeParseJson(await generateTextWithGemini(getPhaseTwoInstruction(phaseOneProject), "light"));
      productionPack = Array.isArray(parsed.scene_packs) ? parsed.scene_packs : [];
      setStage("pack", "ok", `تم تجهيز ${productionPack.length} scene packs.`);
      setStage("visual", "ok", "تم توليد visual prompts لكل المشاهد.");
      setStage("motion", "ok", "تم توليد motion prompts لكل المشاهد.");
      setStage("continuity", "ok", "تم توليد continuity notes وتثبيت الاستمرارية.");
      renderProductionList();
      if (!options.managedByRunAll) document.getElementById("runAssetsBtn").disabled = !productionPack.length;
      autoCollapseCards(["phase-2-progress", "scene-list-card", "production-card"]);
      switchToTab("production");
      status.textContent = "اكتملت المرحلة الثانية بالكامل من Gemini في طلب واحد.";
      return true;
    } catch (error) {
      if (isStopError(error)) {
        ["pack","visual","motion","continuity"].forEach((k) => {
          const badge = document.getElementById(`badge-${k}`);
          if (badge?.classList.contains("loading")) setStage(k, "idle", "تم الإيقاف قبل اكتمال هذه الخطوة.");
        });
        status.textContent = "تم إيقاف المرحلة الثانية يدويًا.";
      } else {
        console.error(error);
        ["pack","visual","motion","continuity"].forEach((k) => setStage(k, "fail", "فشل."));
        status.textContent = "حدث خطأ أثناء تنفيذ المرحلة الثانية.";
      }
      return false;
    } finally {
      if (!options.managedByRunAll) runProductionBtn.disabled = false;
      endManagedOperation();
    }
  }
  // ─── معالجة مقاس الصورة ─────────────────────────────────────────────────
  async function resizeImageNative(dataUrl, targetW, targetH, method) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (method === 'crop') {
          const srcRatio = img.width / img.height;
          const dstRatio = targetW / targetH;
          let sx, sy, sw, sh;
          if (srcRatio > dstRatio) {
            sh = img.height; sw = img.height * dstRatio;
            sx = (img.width - sw) / 2; sy = 0;
          } else {
            sw = img.width; sh = img.width / dstRatio;
            sx = 0; sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        } else {
          ctx.drawImage(img, 0, 0, targetW, targetH);
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }
  let _konvaLoaded = false;
  async function _loadKonva() {
    if (_konvaLoaded || window.Konva) { _konvaLoaded = true; return; }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/konva/9.3.6/konva.min.js';
      s.onload = () => { _konvaLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function resizeImageKonva(dataUrl, targetW, targetH, method) {
    await _loadKonva();
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;left:-99999px;top:-99999px;';
      document.body.appendChild(wrap);
      const stage = new Konva.Stage({ container: wrap, width: targetW, height: targetH });
      const layer = new Konva.Layer();
      stage.add(layer);
      const imageObj = new Image();
      imageObj.onload = () => {
        let x = 0, y = 0, w = targetW, h = targetH;
        if (method === 'crop') {
          const srcRatio = imageObj.width / imageObj.height;
          const dstRatio = targetW / targetH;
          if (srcRatio > dstRatio) { w = targetH * srcRatio; x = (targetW - w) / 2; }
          else { h = targetW / srcRatio; y = (targetH - h) / 2; }
        }
        layer.add(new Konva.Image({ image: imageObj, x, y, width: w, height: h }));
        layer.draw();
        const result = stage.toDataURL({ mimeType: 'image/png' });
        document.body.removeChild(wrap);
        resolve(result);
      };
      imageObj.src = dataUrl;
    });
  }
  async function resizeImage(dataUrl, targetW, targetH) {
    const method   = document.getElementById('resizeMethodSelect').value;
    const lib      = document.getElementById('resizeLibrarySelect').value;
    const shapeKey = document.getElementById('shapeSelect').value;
    const yt       = YOUTUBE_DIMENSIONS[shapeKey] || { width: targetW, height: targetH };
    if (lib === 'konva') return resizeImageKonva(dataUrl, yt.width, yt.height, method);
    return resizeImageNative(dataUrl, yt.width, yt.height, method);
  }
  // ─── توليد الصور مع Watchdog ──────────────────────────────────────────────
  async function runParallelImageGeneration(shape, model, imageStyleModifier, statusEl, options = {}) {
    const MAX_TOTAL_MS   = options.maxTotalMs ?? 180_000;
    const IDLE_RETRY_MS  = options.idleRetryMs ?? 45_000;
    const CHECK_EVERY_MS =   5_000;
    const MAX_AUTO_REFRESH_ROUNDS = options.maxAutoRefreshRounds ?? 4;
    const FINAL_INFLIGHT_DRAIN_MS = options.finalInflightDrainMs ?? 90_000;
    const inFlight = new Set();
    let lastProgressTime = Date.now();
    const startTime = Date.now();
    let autoRefreshRounds = 0;
    let finalDrainStartedAt = 0;
    function getMissingIndices() {
      return sceneAssets.map((a, i) => (!a.imageData ? i : -1)).filter(i => i >= 0);
    }
    function updateStatus() {
      const done = sceneAssets.filter(a => a.imageData).length;
      statusEl.textContent = `تم تجهيز ${done} / ${sceneAssets.length} صورة`;
    }
    async function generateOne(idx) {
      throwIfStopRequested();
      if (inFlight.has(idx)) return;
      if (sceneAssets[idx]?.imageData) return;
      inFlight.add(idx);
      const asset = sceneAssets[idx];
      try {
        // الاستايل يأتي أولاً بشكل إلزامي ثم باقي البرومبت
          const stylePrefix = imageStyleModifier ? `${imageStyleModifier}, ` : "";
          const promptBody  = [
            stripLeadingStyleDirectives(asset.finalPrompt || ""),
            phaseOneProject?.bible?.main_character_profile || "",
            asset.continuityNotes || "",
            qualityPrompt
          ].filter(Boolean).join(", ");
          const response = await t2i({
          prompt: stylePrefix + promptBody,
          negativePrompt: negativePromptBase,
          resolution: shape.resolution,
          width: shape.width,
          height: shape.height,
          model,
          seed: -1
        });
        throwIfStopRequested();
        const resizedUrl = await resizeImage(response.dataUrl, shape.width, shape.height);
        sceneAssets[idx] = { ...sceneAssets[idx], imageData: resizedUrl, error: "" };
        lastProgressTime = Date.now();
      } catch (err) {
        if (!isStopError(err)) {
          console.error(err);
          sceneAssets[idx] = { ...sceneAssets[idx], error: "generation_failed" };
        }
      } finally {
        inFlight.delete(idx);
      }
      renderAssetList();
      updateStatus();
      updateDownloadBtn();
    }
    function launchWorkers(indices) {
      const parallel = Math.min(getImageParallelLimit(), indices.length || 1);
      let pos = 0;
      for (let w = 0; w < parallel; w++) {
        (async () => {
          while (pos < indices.length) {
            if (stopRequested) break;
            const idx = indices[pos++];
            await generateOne(idx);
          }
        })();
      }
    }
    launchWorkers(getMissingIndices().slice());
    await new Promise(resolve => {
      const timer = setInterval(() => {
        if (stopRequested) {
          clearInterval(timer);
          statusEl.textContent = `تم إيقاف توليد الصور. المحفوظ: ${sceneAssets.filter((asset) => asset.imageData).length} / ${sceneAssets.length}`;
          resolve();
          return;
        }
        const missing  = getMissingIndices();
        const elapsed  = Date.now() - startTime;
        const idle     = Date.now() - lastProgressTime;
        if (missing.length === 0) { clearInterval(timer); resolve(); return; }
        if (elapsed >= MAX_TOTAL_MS) {
          if (autoRefreshRounds < MAX_AUTO_REFRESH_ROUNDS) {
            autoRefreshRounds++;
            const notInFlight = missing.filter(i => !inFlight.has(i));
            if (notInFlight.length > 0) {
              notInFlight.forEach(i => { sceneAssets[i] = { ...sceneAssets[i], error: "" }; });
              lastProgressTime = Date.now();
              statusEl.textContent = `جولة إنقاذ تلقائية ${autoRefreshRounds}/${MAX_AUTO_REFRESH_ROUNDS} لإعادة توليد ${notInFlight.length} صورة متبقية...`;
              renderAssetList();
              launchWorkers(notInFlight);
              return;
            }
          }
          if (inFlight.size > 0) {
            if (!finalDrainStartedAt) finalDrainStartedAt = Date.now();
            const drainElapsed = Date.now() - finalDrainStartedAt;
            if (drainElapsed < FINAL_INFLIGHT_DRAIN_MS) {
              statusEl.textContent = `انتهت المهلة الأساسية، لكن ما زلنا ننتظر ${inFlight.size} صورة متأخرة قبل حسم المرحلة...`;
              return;
            }
          }
          clearInterval(timer);
          const done = sceneAssets.filter(a => a.imageData).length;
          statusEl.textContent = inFlight.size > 0
            ? `انتهت مهلة الانتظار الأخيرة. تم تجهيز ${done} / ${sceneAssets.length} صورة.`
            : `انتهت كل محاولات التوليد التلقائي. تم تجهيز ${done} / ${sceneAssets.length} صورة.`;
          resolve();
          return;
        }
        if (idle >= IDLE_RETRY_MS) {
          const notInFlight = missing.filter(i => !inFlight.has(i));
          if (notInFlight.length > 0) {
            notInFlight.forEach(i => { sceneAssets[i] = { ...sceneAssets[i], error: "" }; });
            lastProgressTime = Date.now();
            statusEl.textContent = `لم تُستلم صور جديدة منذ ${Math.round(IDLE_RETRY_MS / 1000)} ثانية — إعادة توليد ${notInFlight.length} صورة تلقائيًا...`;
            renderAssetList();
            launchWorkers(notInFlight);
          } else if (inFlight.size > 0) {
            lastProgressTime = Date.now();
            statusEl.textContent = `في انتظار ${inFlight.size} صورة قيد التوليد...`;
          }
        }
      }, CHECK_EVERY_MS);
    });
  }
  // تجهيز بطاقات المشاهد من مرحلة الإنتاج بدون توليد صور (لوضع «تخطّي مرحلة الصور»)
  function prepareAssetsPlaceholders() {
    if (!productionPack.length) return false;
    const input = getProjectInput();
    sceneAssets = productionPack.map((pack, index) => {
      const motionSource = pack.motion_prompt || "";
      return {
        sceneNumber: pack.scene_number || index + 1,
        title: pack.title || "",
        finalPrompt: stripLeadingStyleDirectives(pack.visual_prompt || ""),
        imageData: "",
        motionText: [sanitizeMotionText(motionSource), motionSafety].filter(Boolean).join(", "),
        cameraDirection: pack.camera_direction || "",
        continuityNotes: pack.continuity_notes || "",
        error: "",
        placeholder: true
      };
    });
    renderAssetList();
    setStage("motion-files", "ok", "تم تجهيز ملفات الحركة والنص النهائي.");
    setStage("images", "idle", "تم تخطّي توليد الصور — اضغط «مرحلة الصور» بعد مراجعة الصوت.");
    setStage("preview", "idle", "بانتظار توليد الصور.");
    setStage("export", "idle", "الحزمة ستكتمل بعد توليد الصور.");
    const assetsBtn = document.getElementById("runAssetsBtn");
    const audioBtn = document.getElementById("runAudioBtn");
    if (assetsBtn) assetsBtn.disabled = false;
    if (audioBtn) audioBtn.disabled = false;
    return true;
  }
  async function runAssetsPipeline(options = {}) {
    const status = document.getElementById("pipelineStatus");
    const runAssetsBtn = document.getElementById("runAssetsBtn");
    const input = getProjectInput();
    const shape = getShapeConfig();
    const model = document.getElementById("imageModelSelect").value;
    const imageStyleKey = document.getElementById("imageStyleSelect").value;
    const imageStyleModifier = IMAGE_STYLE_MAP[imageStyleKey] || "";
    if (!productionPack.length) { alert("نفّذ المرحلة الثانية أولًا."); return false; }
    if (!options.managedByRunAll) clearStopRequest();
    beginManagedOperation();
    runAssetsBtn.disabled = true;
    setCurrentPhase("المرحلة الثالثة");
    status.textContent = "بدأ تنفيذ المرحلة الثالثة...";
    sceneAssets = [];
    renderAssetList();
    try {
      ["motion-files","images","preview","export"].forEach((k) => setStage(k, "loading", "جارٍ التجهيز..."));
      const parsed = safeParseJson(await generateTextWithGemini(getPhaseThreeInstruction(phaseOneProject, productionPack, {
        preserveMotionDetail: input.preserveMotionDetail
      }), "light"));
      phaseThreePlan = Array.isArray(parsed.scene_assets) ? parsed.scene_assets : [];
      sceneAssets = phaseThreePlan.map((item, index) => {
        const pack = productionPack[index] || {};
        const motionSource = input.preserveMotionDetail
          ? (pack.motion_prompt || item.motion_file_text || "")
          : (item.motion_file_text || pack.motion_prompt || "");
        return {
          sceneNumber: item.scene_number || pack.scene_number || index + 1,
          title: item.title || pack.title || "",
          finalPrompt: stripLeadingStyleDirectives(item.final_image_prompt || pack.visual_prompt || ""),
          imageData: "",
          motionText: [sanitizeMotionText(motionSource), motionSafety].filter(Boolean).join(", "),
          cameraDirection: item.camera_direction || pack.camera_direction || "",
          continuityNotes: item.continuity_notes || pack.continuity_notes || "",
          error: ""
        };
      });
      renderAssetList();
      setStage("motion-files", "ok", "تم تجهيز ملفات الحركة والنص النهائي عبر Gemini.");
      setStage("images", "loading", `جارٍ توليد الصور بالتوازي (${getImageParallelLimit()} مهام متزامنة) | استايل: ${imageStyleKey}...`);
      await runParallelImageGeneration(shape, model, imageStyleModifier, status, {
        maxTotalMs: 180_000,
        idleRetryMs: 45_000,
        maxAutoRefreshRounds: 4
      });
      const missingAfterPrimaryRun = sceneAssets.map((asset, index) => (!asset.imageData ? index : -1)).filter(index => index >= 0);
      if (missingAfterPrimaryRun.length) {
        status.textContent = `تبقّى ${missingAfterPrimaryRun.length} صورة بعد الجولة الأساسية — بدء جولة إنقاذ نهائية أطول...`;
        await runParallelImageGeneration(shape, model, imageStyleModifier, status, {
          maxTotalMs: 120_000,
          idleRetryMs: 30_000,
          maxAutoRefreshRounds: 2
        });
      }
      const finalMissing = sceneAssets.map((asset, index) => (!asset.imageData ? index : -1)).filter(index => index >= 0);
      if (finalMissing.length) {
        setStage("images", "fail", `تعذر توليد ${finalMissing.length} صورة بعد كل المحاولات التلقائية.`);
        setStage("preview", "ok", "تم عرض الصور المتاحة داخل الواجهة.");
        setStage("export", "fail", "الحزمة لن تكتمل قبل نجاح كل الصور.");
        status.textContent = `لا تزال ${finalMissing.length} صورة غير متولدة. سيبقى زر إعادة التوليد متاحًا لها تلقائيًا ويدويًا.`;
      } else {
        setStage("images", "ok", `تم توليد الصور بالتوازي | استايل: ${imageStyleKey}.`);
        setStage("preview", "ok", "تم عرض معاينة الأصول داخل الواجهة.");
        setStage("export", "ok", "أصبحت حزمة المشروع جاهزة للتنزيل.");
        document.getElementById("downloadProjectBtn").disabled = false;
        document.getElementById("runAudioBtn").disabled = false;
      }
      autoCollapseCards(["phase-3-progress"]);
      switchToTab("media");
      if (!finalMissing.length) status.textContent = "اكتملت المرحلة الثالثة بنجاح.";
      return !finalMissing.length;
    } catch (error) {
      if (isStopError(error)) {
        ["images","motion-files","preview","export"].forEach((k) => {
          const badge = document.getElementById(`badge-${k}`);
          if (badge?.classList.contains("loading")) setStage(k, "idle", "تم إيقاف هذه الخطوة.");
        });
        status.textContent = "تم إيقاف المرحلة الثالثة يدويًا.";
      } else {
        console.error(error);
        ["images","motion-files","preview","export"].forEach((k) => setStage(k, "fail", "فشل."));
        status.textContent = "حدث خطأ أثناء تنفيذ المرحلة الثالثة.";
      }
      return false;
    } finally {
      if (!options.managedByRunAll) runAssetsBtn.disabled = false;
      endManagedOperation();
    }
  }
  // ─── نظام TTS بالدُفعات ─────────────────────────────────────────────────────

  // فك ترميز base64 PCM إلى Float32Array
  async function decodePcmBase64ToFloat32(base64Data, sampleRate = 24000) {
    const pcmBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const samples = new Float32Array(pcmBytes.length / 2);
    const view = new DataView(pcmBytes.buffer);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }
    return { samples, sampleRate };
  }

  function uint8ToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function concatFloat32Arrays(chunks) {
    const arrays = (chunks || []).filter((chunk) => chunk && chunk.length);
    const totalLength = arrays.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    arrays.forEach((chunk) => {
      merged.set(chunk, offset);
      offset += chunk.length;
    });
    return merged;
  }

  function createAudioArtifactFromSamples(samples, sampleRate = 24000) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
    }
    return {
      wavUrl: float32ToWavUrl(samples, sampleRate),
      base64Data: uint8ToBase64(new Uint8Array(pcm.buffer)),
      error: ""
    };
  }

  // كشف مناطق الصمت في الصوت
  function findSilenceRegions(samples, sampleRate, minSilenceMs = 80, threshold = 0.015) {
    const minSilenceSamples = Math.floor((minSilenceMs / 1000) * sampleRate);
    const regions = [];
    let silenceStart = -1;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) < threshold) {
        if (silenceStart < 0) silenceStart = i;
      } else {
        if (silenceStart >= 0 && (i - silenceStart) >= minSilenceSamples) {
          regions.push({ start: silenceStart, end: i, mid: Math.floor((silenceStart + i) / 2) });
        }
        silenceStart = -1;
      }
    }
    if (silenceStart >= 0 && (samples.length - silenceStart) >= minSilenceSamples) {
      regions.push({ start: silenceStart, end: samples.length - 1, mid: Math.floor((silenceStart + samples.length - 1) / 2) });
    }
    return regions;
  }

  function findNarrationBoundaryRatios(texts) {
    const items = (texts || []).map((text) => String(text || "").trim()).filter(Boolean);
    if (items.length <= 1) return [];
    const joined = items.join("\n\n");
    const totalChars = joined.length || 1;
    const boundaries = [];
    let cursor = 0;
    for (let i = 0; i < items.length - 1; i++) {
      cursor += items[i].length;
      const searchRadius = Math.max(8, Math.floor(totalChars * 0.03));
      const lo = Math.max(0, cursor - searchRadius);
      const hi = Math.min(joined.length - 1, cursor + searchRadius);
      let bestIndex = cursor;
      let bestScore = Infinity;
      for (let pos = lo; pos <= hi; pos++) {
        const ch = joined[pos];
        const prev = joined[Math.max(0, pos - 1)] || "";
        const next = joined[Math.min(joined.length - 1, pos + 1)] || "";
        const isPunctuation = /[.!?؟،,:;\n…]/.test(ch);
        const isWhitespace = /\s/.test(ch);
        if (!isPunctuation && !isWhitespace) continue;
        const distance = Math.abs(pos - cursor);
        const edgePenalty = (!/\s/.test(prev) && !/\s/.test(next) && !isPunctuation) ? searchRadius : 0;
        const punctuationBonus = isPunctuation ? -4 : 0;
        const score = distance + edgePenalty + punctuationBonus;
        if (score < bestScore) {
          bestScore = score;
          bestIndex = pos;
        }
      }
      boundaries.push(bestIndex / totalChars);
      cursor += 2; // account for inserted "\n\n"
    }
    return boundaries;
  }

  function resolveAudioCutPoints(totalSamples, sampleRate, targetRatios, silenceRegions) {
    const safetyMargin = Math.max(Math.floor(sampleRate * 0.22), Math.floor(totalSamples * 0.015));
    const desiredMinSegmentSamples = Math.floor(sampleRate * TTS_MIN_SEGMENT_SEC);
    const segmentCount = (targetRatios?.length || 0) + 1;
    const feasibleMinSegmentSamples = segmentCount > 0
      ? Math.min(desiredMinSegmentSamples, Math.floor(totalSamples / segmentCount))
      : desiredMinSegmentSamples;
    const minSegmentSamples = Math.max(Math.floor(sampleRate * 1.25), feasibleMinSegmentSamples);
    const cutPoints = [0];
    (targetRatios || []).forEach((ratio, index) => {
      const estimated = Math.floor(Math.max(0, Math.min(1, ratio)) * totalSamples);
      const remainingBoundaries = targetRatios.length - index;
      const minAllowed = cutPoints[cutPoints.length - 1] + Math.max(safetyMargin, minSegmentSamples);
      const maxAllowed = totalSamples - ((remainingBoundaries + 1) * minSegmentSamples);
      const searchRange = Math.max(Math.floor(totalSamples * 0.22), safetyMargin * 2);
      const boundedMaxAllowed = Math.max(minAllowed, maxAllowed);
      const lo = Math.max(minAllowed, estimated - searchRange);
      const hi = Math.min(boundedMaxAllowed, estimated + searchRange);
      let best = null;
      let bestDist = Infinity;
      for (const region of silenceRegions) {
        if (region.mid >= lo && region.mid <= hi) {
          const dist = Math.abs(region.mid - estimated);
          if (dist < bestDist) {
            bestDist = dist;
            best = region.mid;
          }
        }
      }
      const fallback = Math.max(minAllowed, Math.min(boundedMaxAllowed, estimated));
      cutPoints.push(best ?? fallback);
    });
    cutPoints.push(totalSamples);
    return cutPoints;
  }

  // تقسيم الصوت على عدد الجمل باستخدام كشف الصمت + نسبة الحروف
  function splitAudioBySeparators(samples, sampleRate, separatorCount, charCounts, texts = []) {
    const total = samples.length;
    const silenceRegions = findSilenceRegions(samples, sampleRate, 110, 0.0135);
    const totalChars = charCounts.reduce((a, b) => a + b, 0) || 1;
    let targetRatios = findNarrationBoundaryRatios(texts);
    if (!targetRatios.length) {
      let cumChars = 0;
      targetRatios = [];
      for (let i = 0; i < separatorCount; i++) {
        cumChars += charCounts[i];
        targetRatios.push(cumChars / totalChars);
      }
    }
    const cutPoints = resolveAudioCutPoints(total, sampleRate, targetRatios, silenceRegions);
    return cutPoints.slice(0, -1).map((start, i) => samples.slice(start, cutPoints[i + 1]));
  }

  // تحويل Float32Array إلى data URL صوتي WAV
  function float32ToWavUrl(samples, sampleRate = 24000) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
    }
    const pcmBytes = new Uint8Array(pcm.buffer);
    const buf = new ArrayBuffer(44 + pcmBytes.length);
    const v = new DataView(buf);
    const wa = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    wa(0, "RIFF"); v.setUint32(4, 36 + pcmBytes.length, true);
    wa(8, "WAVE"); wa(12, "fmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    wa(36, "data"); v.setUint32(40, pcmBytes.length, true);
    new Uint8Array(buf, 44).set(pcmBytes);
    const bytes = new Uint8Array(buf);
    return `data:audio/wav;base64,${uint8ToBase64(bytes)}`;
  }
  // تقسيم صوت كلي على المشاهد حسب نسبة عدد الحروف + كشف الصمت
  function splitAudioByCharRatio(samples, sampleRate, charCounts, texts = []) {
    const total = samples.length;
    const totalChars = charCounts.reduce((a, b) => a + b, 0) || 1;
    const silenceRegions = findSilenceRegions(samples, sampleRate, 110, 0.0135);
    let targetRatios = findNarrationBoundaryRatios(texts);
    if (!targetRatios.length) {
      targetRatios = [];
      let cumChars = 0;
      for (let i = 0; i < charCounts.length - 1; i++) {
        cumChars += charCounts[i];
        targetRatios.push(cumChars / totalChars);
      }
    }
    const cutPoints = resolveAudioCutPoints(total, sampleRate, targetRatios, silenceRegions);
    return cutPoints.slice(0, -1).map((start, i) => samples.slice(start, cutPoints[i + 1]));
  }

  function createSmartAudioBatches(scenes, charLimit = TTS_BATCH_CHAR_LIMIT) {
    const batches = [];
    let currentBatch = [];
    let currentChars = 0;

    scenes.forEach((scene, index) => {
      const text = (scene.narration || scene.title || "").trim();
      const textLen = text.length;

      if (currentBatch.length && (currentChars + textLen > charLimit)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChars = 0;
      }

      currentBatch.push({
        scene,
        index,
        text,
        charCount: textLen
      });
      currentChars += textLen;
    });

    if (currentBatch.length) {
      batches.push(currentBatch);
    }

    return batches;
  }

  // ─── محاذاة دقيقة بالتعرّف على الكلام (Whisper Forced Alignment) ──────────
  const WHISPER_MODEL = "Xenova/whisper-small";
  const WHISPER_PREF_KEY = "story_studio_v32_whisper_align";
  const SKIP_IMG_PREF_KEY = "story_studio_v32_skip_image_stage";
  const WHISPER_TARGET_SR = 16000;
  // حفظ/استرجاع اختيار «تخطّي مرحلة الصور» في المتصفح
  function onSkipImageStageToggle() {
    const on = document.getElementById("skipImageStageToggle")?.checked || false;
    try { localStorage.setItem(SKIP_IMG_PREF_KEY, on ? "1" : "0"); } catch (e) {}
  }
  function loadSkipImagePref() {
    try {
      const saved = localStorage.getItem(SKIP_IMG_PREF_KEY);
      const el = document.getElementById("skipImageStageToggle");
      if (el && saved === "1") el.checked = true;
    } catch (e) {}
  }
  let _whisperWorker = null;
  let _whisperReady = false;
  let _whisperLoadingPromise = null;
  let _whisperReadyResolve = null;
  const _whisperPending = new Map();
  let _whisperJobSeq = 0;

  function useWhisperAlignEnabled() {
    return document.getElementById("whisperAlignToggle")?.checked || false;
  }
  // فاصل المشاهد المتكيّف: مع Whisper نكتفي بسكتة طبيعية قصيرة (فيديو منساب)،
  // وبدونه نُبقي السكتة الأوضح ( \n\n ) لأن كشف الصمت يعتمد عليها.
  function ttsSceneSeparator() {
    return useWhisperAlignEnabled() ? "\n" : "\n\n";
  }
  function setWhisperStatus(msg) {
    const el = document.getElementById("whisperAlignStatus");
    if (el) { el.style.display = msg ? "block" : "none"; el.textContent = msg || ""; }
    if (msg) updateAiProviderStatus(msg);
  }
  // حفظ اختيار المستخدم + تسخين النموذج في الخلفية لتوفير الوقت
  function onWhisperAlignToggle() {
    const on = useWhisperAlignEnabled();
    try { localStorage.setItem(WHISPER_PREF_KEY, on ? "1" : "0"); } catch (e) {}
    if (on) {
      // تحميل مبكر في الخلفية (fire-and-forget) أثناء انشغالك بالمراحل الأولى
      ensureWhisperLoaded().then((ok) => {
        if (ok) setWhisperStatus("نموذج التقطيع الدقيق جاهز ✓ سيُستخدم تلقائيًا في مرحلة الصوت.");
        else setWhisperStatus("تعذّر التحميل الآن — سيُعاد المحاولة وقت توليد الصوت.");
      });
    } else {
      setWhisperStatus("");
    }
  }
  // عند فتح الموقع: استرجاع الاختيار المحفوظ، وبدء التسخين لو كان مفعّلًا
  function loadWhisperPref() {
    try {
      const saved = localStorage.getItem(WHISPER_PREF_KEY);
      const el = document.getElementById("whisperAlignToggle");
      if (el && saved === "1") {
        el.checked = true;
        ensureWhisperLoaded().then((ok) => {
          if (ok) setWhisperStatus("نموذج التقطيع الدقيق جاهز ✓ سيُستخدم تلقائيًا في مرحلة الصوت.");
        });
      }
    } catch (e) {}
  }
  function _createWhisperWorker() {
    const workerSource = [
      "import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';",
      "env.allowLocalModels = false;",
      "let asr = null;",
      "self.onmessage = async (e) => {",
      "  const msg = e.data || {};",
      "  try {",
      "    if (msg.type === 'load') {",
      "      if (!asr) {",
      "        asr = await pipeline('automatic-speech-recognition', msg.model, {",
      "          dtype: 'q8',",
      "          progress_callback: (p) => self.postMessage({ type: 'progress', data: p })",
      "        });",
      "      }",
      "      self.postMessage({ type: 'ready' });",
      "    } else if (msg.type === 'transcribe') {",
      "      const out = await asr(msg.audio, {",
      "        return_timestamps: 'word',",
      "        chunk_length_s: 30,",
      "        stride_length_s: 5,",
      "        language: msg.language || 'arabic',",
      "        task: 'transcribe'",
      "      });",
      "      self.postMessage({ type: 'result', id: msg.id, data: { chunks: out.chunks || [], text: out.text || '' } });",
      "    }",
      "  } catch (err) {",
      "    self.postMessage({ type: 'error', id: msg.id, error: String((err && err.message) || err) });",
      "  }",
      "};"
    ].join("\n");
    const blob = new Blob([workerSource], { type: "text/javascript" });
    const worker = new Worker(URL.createObjectURL(blob), { type: "module" });
    worker.addEventListener("message", (e) => {
      const msg = e.data || {};
      if (msg.type === "progress") {
        const d = msg.data || {};
        if (d.status === "progress" && d.progress != null) {
          setWhisperStatus(`تحميل نموذج التقطيع الدقيق: ${Math.round(d.progress)}%`);
        }
      } else if (msg.type === "ready") {
        _whisperReady = true;
        setWhisperStatus("نموذج التقطيع الدقيق جاهز ✓");
        if (_whisperReadyResolve) { _whisperReadyResolve(true); _whisperReadyResolve = null; }
      } else if (msg.type === "result") {
        const job = _whisperPending.get(msg.id);
        if (job) { _whisperPending.delete(msg.id); job.resolve(msg.data); }
      } else if (msg.type === "error") {
        if (msg.id != null && _whisperPending.has(msg.id)) {
          const job = _whisperPending.get(msg.id);
          _whisperPending.delete(msg.id);
          job.reject(new Error(msg.error));
        } else if (_whisperReadyResolve) {
          _whisperReadyResolve(false);
          _whisperReadyResolve = null;
        }
        console.error("Whisper worker:", msg.error);
      }
    });
    worker.addEventListener("error", (err) => {
      console.error("Whisper worker fatal:", err);
      if (_whisperReadyResolve) { _whisperReadyResolve(false); _whisperReadyResolve = null; }
    });
    return worker;
  }
  async function ensureWhisperLoaded() {
    if (_whisperReady) return true;
    if (_whisperLoadingPromise) return _whisperLoadingPromise;
    _whisperLoadingPromise = new Promise((resolve) => {
      _whisperReadyResolve = resolve;
      try {
        if (!_whisperWorker) _whisperWorker = _createWhisperWorker();
        setWhisperStatus("بدء تحميل نموذج التقطيع الدقيق لأول مرة...");
        _whisperWorker.postMessage({ type: "load", model: WHISPER_MODEL });
      } catch (err) {
        console.error(err);
        _whisperReadyResolve = null;
        resolve(false);
      }
    });
    const ok = await _whisperLoadingPromise;
    _whisperLoadingPromise = null;
    return ok;
  }
  function whisperTranscribe(float32at16k, language) {
    const id = ++_whisperJobSeq;
    return new Promise((resolve, reject) => {
      _whisperPending.set(id, { resolve, reject });
      _whisperWorker.postMessage({ type: "transcribe", id, audio: float32at16k, language }, [float32at16k.buffer]);
    });
  }
  function resampleTo16k(samples, sampleRate) {
    if (sampleRate === WHISPER_TARGET_SR) return Float32Array.from(samples);
    const ratio = sampleRate / WHISPER_TARGET_SR;
    const newLen = Math.max(1, Math.floor(samples.length / ratio));
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const idx = i * ratio;
      const i0 = Math.floor(idx);
      const i1 = Math.min(samples.length - 1, i0 + 1);
      const frac = idx - i0;
      out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
    }
    return out;
  }
  function _normAlignWord(w) {
    return String(w || "")
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, "")
      .replace(/ـ/g, "")
      .replace(/[إأآا]/g, "ا")
      .replace(/[ىي]/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ء/g, "")
      .replace(/ة/g, "ه")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase()
      .trim();
  }
  function _tokenizeWords(text) {
    return String(text || "").split(/\s+/).map((w) => w.trim()).filter(Boolean);
  }
  // محاذاة Needleman-Wunsch بين كلمات النص المعروف وكلمات الـ STT
  function _alignKnownToStt(knownNorm, sttNorm) {
    const n = knownNorm.length, m = sttNorm.length;
    const GAP = -1, MATCH = 2, MISS = -1;
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const bt = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
    for (let i = 1; i <= n; i++) { dp[i][0] = i * GAP; bt[i][0] = 1; }
    for (let j = 1; j <= m; j++) { dp[0][j] = j * GAP; bt[0][j] = 2; }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const s = knownNorm[i - 1] === sttNorm[j - 1] ? MATCH : MISS;
        const diag = dp[i - 1][j - 1] + s;
        const up = dp[i - 1][j] + GAP;
        const left = dp[i][j - 1] + GAP;
        let best = diag, dir = 0;
        if (up > best) { best = up; dir = 1; }
        if (left > best) { best = left; dir = 2; }
        dp[i][j] = best; bt[i][j] = dir;
      }
    }
    const map = new Array(n).fill(-1);
    let i = n, j = m;
    while (i > 0 && j > 0) {
      const dir = bt[i][j];
      if (dir === 0) { map[i - 1] = (knownNorm[i - 1] === sttNorm[j - 1]) ? j - 1 : -1; i--; j--; }
      else if (dir === 1) { i--; }
      else { j--; }
    }
    return map;
  }
  // يرجّع مصفوفة مقاطع (texts.length) أو null لو تعذّرت المحاذاة (ليرجع المُنادي لنسبة الحروف)
  async function computeAlignedSegments(samples, sampleRate, texts) {
    if (!useWhisperAlignEnabled()) return null;
    const scenes = (texts || []).map((t) => String(t || "").trim());
    if (scenes.length <= 1) return null;
    try {
      const ok = await ensureWhisperLoaded();
      if (!ok) { setWhisperStatus("تعذّر تحميل النموذج — الرجوع لنسبة الحروف."); return null; }
      throwIfStopRequested();
      setWhisperStatus("جارٍ محاذاة الصوت بالنص بدقة...");
      const audio16k = resampleTo16k(samples, sampleRate);
      const lang = /[؀-ۿ]/.test(scenes.join(" ")) ? "arabic"
        : (String(phaseOneProject?.language || "english").toLowerCase().includes("arab") ? "arabic" : "english");
      const res = await whisperTranscribe(audio16k, lang);
      const chunks = (res?.chunks || []).filter((c) => c && Array.isArray(c.timestamp) && c.text);
      const sttWords = chunks.map((c) => ({
        norm: _normAlignWord(c.text),
        start: Number(c.timestamp[0] ?? 0),
        end: Number(c.timestamp[1] ?? c.timestamp[0] ?? 0)
      })).filter((w) => w.norm && isFinite(w.start) && isFinite(w.end));
      if (sttWords.length < 2) { setWhisperStatus("تفريغ غير كافٍ — الرجوع لنسبة الحروف."); return null; }

      const knownWords = [];
      const sceneEndKnownIdx = [];
      scenes.forEach((sc, si) => {
        const ws = _tokenizeWords(sc).map(_normAlignWord).filter(Boolean);
        ws.forEach((w) => knownWords.push(w));
        if (si < scenes.length - 1) sceneEndKnownIdx.push(knownWords.length - 1);
      });
      if (!knownWords.length) return null;

      const map = _alignKnownToStt(knownWords, sttWords.map((w) => w.norm));
      const matchRatio = map.filter((x) => x >= 0).length / knownWords.length;
      if (matchRatio < 0.45) { setWhisperStatus(`تطابق منخفض (${Math.round(matchRatio * 100)}%) — الرجوع لنسبة الحروف.`); return null; }

      const knownTime = new Array(knownWords.length).fill(null);
      for (let k = 0; k < knownWords.length; k++) {
        if (map[k] >= 0) { const s = sttWords[map[k]]; knownTime[k] = { start: s.start, end: s.end }; }
      }
      const totalDur = samples.length / sampleRate;
      const charCounts = scenes.map((s) => s.length || 1);
      const totalChars = charCounts.reduce((a, b) => a + b, 0) || 1;
      const ratioCut = [];
      let cumChars = 0;
      for (let i = 0; i < scenes.length - 1; i++) { cumChars += charCounts[i]; ratioCut.push((cumChars / totalChars) * totalDur); }

      const cutTimes = [];
      let knownCount = 0;
      sceneEndKnownIdx.forEach((bIdx, bi) => {
        let endT = null, startNextT = null;
        for (let k = bIdx; k >= 0; k--) { if (knownTime[k]) { endT = knownTime[k].end; break; } }
        for (let k = bIdx + 1; k < knownWords.length; k++) { if (knownTime[k]) { startNextT = knownTime[k].start; break; } }
        let cut = null;
        if (endT != null && startNextT != null && startNextT >= endT) { cut = (endT + startNextT) / 2; knownCount++; }
        else if (endT != null) { cut = endT; knownCount++; }
        else if (startNextT != null) { cut = startNextT; knownCount++; }
        cutTimes.push(cut == null ? ratioCut[bi] : cut);
      });
      if (knownCount / cutTimes.length < 0.6) { setWhisperStatus("محاذاة غير كافية — الرجوع لنسبة الحروف."); return null; }

      const minGap = Math.max(Math.floor(sampleRate * 0.6), Math.floor(samples.length / (scenes.length * 4)));
      const cutSamples = [];
      let prev = 0;
      for (let i = 0; i < cutTimes.length; i++) {
        let s = Math.round((cutTimes[i] || 0) * sampleRate);
        const maxAllowed = samples.length - (cutTimes.length - i) * minGap;
        s = Math.max(prev + minGap, Math.min(s, maxAllowed));
        cutSamples.push(s);
        prev = s;
      }
      const points = [0, ...cutSamples, samples.length];
      const segs = [];
      for (let i = 0; i < points.length - 1; i++) segs.push(samples.slice(points[i], points[i + 1]));
      if (segs.length !== scenes.length) return null;
      setWhisperStatus(`تم التقطيع الدقيق ✓ (تطابق ${Math.round(matchRatio * 100)}%)`);
      return segs;
    } catch (err) {
      if (isStopError(err)) throw err;
      console.error("Whisper alignment failed:", err);
      setWhisperStatus("فشل التقطيع الدقيق — الرجوع لنسبة الحروف.");
      return null;
    }
  }
  // غلاف آمن: يحاول المحاذاة الدقيقة وإلا يرجع لنسبة الحروف (لا تقل الدقة أبدًا عن الحالي)
  async function alignedOrRatioSplit(samples, sampleRate, charCounts, texts) {
    try {
      const aligned = await computeAlignedSegments(samples, sampleRate, texts);
      if (aligned && aligned.length) return aligned;
    } catch (err) {
      if (isStopError(err)) throw err;
      console.error("alignedOrRatioSplit error:", err);
    }
    return splitAudioByCharRatio(samples, sampleRate, charCounts, texts);
  }

  // ─── المرحلة الرابعة: توليد الصوت ────────────────────────────────────────
  async function runAudioPipeline(options = {}) {
    const status = document.getElementById("pipelineStatus");
    const runAudioBtn = document.getElementById("runAudioBtn");
    const input = getProjectInput();
    if (!phaseOneProject?.scenes?.length) { alert("نفّذ المرحلة الأولى أولًا."); return false; }
    const apiKeys = getGeminiApiKeys();
    if (!apiKeys.length) { alert("أضف مفاتيح Gemini API أولًا."); return false; }
    if (!options.managedByRunAll) clearStopRequest();
    beginManagedOperation();
    runAudioBtn.disabled = true;
    setCurrentPhase("المرحلة الرابعة");
    status.textContent = "بدأ توليد الصوت (مرحلة 4)...";
    sceneAudios = new Array(phaseOneProject.scenes.length).fill(null).map(() => ({ wavUrl: "", base64Data: "", error: "" }));
    fullProjectAudio = { wavUrl: "", base64Data: "", error: "" };
    failedAudioBatches = [];
    renderAssetList();
    try {
      setStage("audio-queue", "loading", "تجهيز قائمة التعليق الصوتي...");
      setStage("audio-generate", "loading", "إرسال الجمل إلى Gemini TTS...");
      setStage("audio-preview", "loading", "جارٍ تجهيز المشغّل...");
      setStage("audio-export", "loading", "سيتم تضمين الصوت في الحزمة...");
      const scenes = phaseOneProject.scenes;
      setStage("audio-queue", "ok", `تم تجهيز ${scenes.length} مشهد للتعليق الصوتي.`);
      const requestedAudioMode = input.audioMode;
      const autoVoice = normalizeTtsVoice((input.audioVoice === "auto") ? (projectTtsVoice || "Kore") : input.audioVoice);
      const stylePrefix = normalizeText(document.getElementById("audioStylePrefixInput").value);
      const allNarrations = scenes.map((scene) => (scene.narration || scene.title || "").trim()).filter(Boolean);
      const fullProjectText = stylePrefix
        ? `${stylePrefix}\n\n${allNarrations.join(ttsSceneSeparator())}`
        : allNarrations.join(ttsSceneSeparator());
      const shouldUseSingleRequest = fullProjectText.length > 0 && fullProjectText.length <= TTS_SINGLE_REQUEST_CHAR_LIMIT;
      const effectiveAudioMode = requestedAudioMode === "per-sentence"
        ? "per-sentence"
        : (shouldUseSingleRequest ? "single-request" : "smart-batches");

      if (effectiveAudioMode === "single-request") {
        setStage("audio-generate", "loading", `إرسال ${scenes.length} مشهد في طلب صوت واحد...`);
        const batchMeta = {
          id: "audio-batch-single-request",
          kind: "single-request",
          label: `دفعة كاملة (${scenes.length} مشهد)`,
          sceneIndexes: scenes.map((_, index) => index),
          texts: allNarrations.slice()
        };
        try {
          status.textContent = `طلب صوت واحد | ${scenes.length} مشهد`;
          const base64Data = await callGeminiTts(fullProjectText, autoVoice, input.audioModel, apiKeys, status);
          const { samples, sampleRate } = await decodePcmBase64ToFloat32(base64Data);
          fullProjectAudio = createAudioArtifactFromSamples(samples, sampleRate);
          try {
            const charCounts = allNarrations.map(n => n.length || 1);
            const segments = scenes.length === 1
              ? [samples]
              : await alignedOrRatioSplit(samples, sampleRate, charCounts, allNarrations);

            scenes.forEach((scene, index) => {
              const seg = segments[index] || segments[segments.length - 1] || samples;
              sceneAudios[index] = createAudioArtifactFromSamples(seg, sampleRate);
            });
          } catch (splitErr) {
            console.error(splitErr);
            scenes.forEach((scene, index) => {
              sceneAudios[index] = { wavUrl: "", base64Data: "", error: "split_failed_full_audio_available" };
            });
            status.textContent = "فشل تقطيع المشاهد، لكن تم الاحتفاظ بالصوت الكامل كنسخة احتياطية.";
          }
          clearFailedAudioBatch(batchMeta.id);
          renderAssetList();
        } catch (err) {
          if (isStopError(err)) throw err;
          console.error(err);
          upsertFailedAudioBatch({ ...batchMeta, error: err.message });
          scenes.forEach((scene, index) => {
            sceneAudios[index] = { wavUrl: "", base64Data: "", error: err.message };
          });
          renderAssetList();
        }
      } else if (effectiveAudioMode === "smart-batches") {
        // ─── كل المشاهد لكن على دفعات ذكية مثل سكربت البايثون ───────────
        const batches = createSmartAudioBatches(scenes, TTS_BATCH_CHAR_LIMIT);
        let processedBatches = 0;
        let generatedScenes = 0;
        const projectBatchSegments = [];
        let splitFallbackUsed = false;
        setStage("audio-generate", "loading", `إرسال ${scenes.length} مشهد في ${batches.length} دفعة ذكية...`);

        for (const batch of batches) {
          throwIfStopRequested();
          const narrations = batch.map(item => item.text);
          const batchMeta = {
            id: `audio-batch-smart-${batch[0]?.index ?? 0}-${batch[batch.length - 1]?.index ?? 0}`,
            kind: "smart-batch",
            label: `دفعة المشاهد ${batch.map((item) => item.index + 1).join("، ")}`,
            sceneIndexes: batch.map((item) => item.index),
            texts: narrations.slice()
          };
          const combinedText = stylePrefix
            ? `${stylePrefix}\n\n${narrations.join(ttsSceneSeparator())}`
            : narrations.join(ttsSceneSeparator());

          try {
            status.textContent = `دفعة ${processedBatches + 1} / ${batches.length} — ${batch.length} مشهد`;
            const base64Data = await callGeminiTts(combinedText, autoVoice, input.audioModel, apiKeys, status);
            const { samples, sampleRate } = await decodePcmBase64ToFloat32(base64Data);
            projectBatchSegments.push(samples);
            try {
              const charCounts = narrations.map(n => n.length || 1);
              const segments = batch.length === 1
                ? [samples]
                : await alignedOrRatioSplit(samples, sampleRate, charCounts, narrations);

              batch.forEach((item, localIndex) => {
                const seg = segments[localIndex] || segments[segments.length - 1] || samples;
                sceneAudios[item.index] = createAudioArtifactFromSamples(seg, sampleRate);
                generatedScenes += 1;
              });
              clearFailedAudioBatch(batchMeta.id);
            } catch (splitErr) {
              console.error(splitErr);
              splitFallbackUsed = true;
              batch.forEach((item) => {
                sceneAudios[item.index] = { wavUrl: "", base64Data: "", error: "split_failed_full_audio_available" };
              });
            }
          } catch (err) {
            if (isStopError(err)) throw err;
            console.error(err);
            upsertFailedAudioBatch({ ...batchMeta, error: err.message });
            batch.forEach((item) => {
              sceneAudios[item.index] = { wavUrl: "", base64Data: "", error: err.message };
            });
          }

          processedBatches += 1;
          renderAssetList();
          status.textContent = `تم إنهاء ${processedBatches} / ${batches.length} دفعة صوتية | ${generatedScenes} / ${scenes.length} مشهد`;

          if (processedBatches < batches.length) {
            await waitWithStop(TTS_BATCH_PAUSE_MS);
          }
        }

        if (projectBatchSegments.length === batches.length) {
          const mergedSamples = concatFloat32Arrays(projectBatchSegments);
          if (mergedSamples.length) {
            fullProjectAudio = createAudioArtifactFromSamples(mergedSamples, 24000);
          }
        }
        if (splitFallbackUsed && fullProjectAudio?.wavUrl) {
          status.textContent = `تم الاحتفاظ بالصوت الكامل كنسخة احتياطية بعد تعذر بعض عمليات التقطيع.`;
        }
      } else {
        // ─── جملة بجملة ──────────────────────────────────────────────────
        setStage("audio-generate", "loading", "توليد الصوت جملة بجملة...");
        let completed = 0, nextIndex = 0;
        const concurrency = input.audioParallel;
        async function audioWorker() {
          while (nextIndex < scenes.length) {
            throwIfStopRequested();
            const idx = nextIndex++;
            const scene = scenes[idx];
            const text = stylePrefix
              ? `${stylePrefix}\n\n${(scene.narration || scene.title || "").trim()}`
              : (scene.narration || scene.title || "").trim();
            try {
              const base64Data = await callGeminiTts(text, autoVoice, input.audioModel, apiKeys, status);
              sceneAudios[idx] = { wavUrl: createWavDataUrl(base64Data), base64Data, error: "" };
            } catch (err) {
              if (isStopError(err)) throw err;
              console.error(err);
              sceneAudios[idx] = { wavUrl: "", base64Data: "", error: err.message };
            }
            completed++;
            renderAssetList();
            status.textContent = `تم توليد صوت ${completed} / ${scenes.length} مشهد`;
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, scenes.length) }, () => audioWorker()));
      }

      const successCount = sceneAudios.filter((a) => a?.wavUrl).length;
      const hasFullFallback = Boolean(fullProjectAudio?.wavUrl);
      setStage("audio-generate", "ok", `تم توليد ${successCount} / ${scenes.length} ملف صوتي${hasFullFallback ? " + نسخة كاملة" : ""}.`);
      setStage("audio-preview", "ok", "تم عرض مشغّل الصوت لكل مشهد.");
      setStage("audio-export", "ok", hasFullFallback ? "ملفات WAV + النسخة الكاملة جاهزة في حزمة التنزيل." : "ملفات WAV جاهزة في حزمة التنزيل.");
      document.getElementById("downloadProjectBtn").disabled = false;
      autoCollapseCards(["phase-4-progress"]);
      switchToTab("media");
      checkProjectComplete();
      status.textContent = hasFullFallback
        ? `اكتملت مرحلة الصوت: ${successCount} / ${scenes.length} ملف مشهدي + صوت كامل احتياطي.`
        : `اكتملت مرحلة الصوت: ${successCount} / ${scenes.length} ملف.`;
      return true;
    } catch (error) {
      if (isStopError(error)) {
        ["audio-generate","audio-preview","audio-export"].forEach((k) => {
          const badge = document.getElementById(`badge-${k}`);
          if (badge?.classList.contains("loading")) setStage(k, "idle", "تم إيقاف هذه الخطوة.");
        });
        status.textContent = "تم إيقاف مرحلة الصوت يدويًا.";
      } else {
        console.error(error);
        ["audio-generate","audio-preview","audio-export"].forEach((k) => setStage(k, "fail", "فشل."));
        status.textContent = "حدث خطأ أثناء توليد الصوت.";
      }
      return false;
    } finally {
      if (!options.managedByRunAll) runAudioBtn.disabled = false;
      endManagedOperation();
    }
  }
  async function runStandaloneAudioStudio() {
    const status = document.getElementById("standaloneAudioStatus");
    const runBtn = document.getElementById("runStandaloneAudioBtn");
    const input = getStandaloneAudioInput();
    const scenes = standaloneAudioSource.items;
    if (!scenes.length) { alert("ارفع ملف الجمل أولًا."); return false; }
    const apiKeys = getGeminiApiKeys();
    if (!apiKeys.length) { alert("أضف مفاتيح Gemini API أولًا."); return false; }
    clearStopRequest();
    beginManagedOperation();
    runBtn.disabled = true;
    standaloneSceneAudios = new Array(scenes.length).fill(null).map(() => ({ wavUrl: "", base64Data: "", error: "" }));
    standaloneFullAudio = { wavUrl: "", base64Data: "", error: "" };
    renderStandaloneAudioList();
    try {
      status.textContent = `بدأ توليد الصوت المستقل لـ ${scenes.length} عنصر...`;
      const requestedAudioMode = input.audioMode;
      const autoVoice = normalizeTtsVoice(input.audioVoice === "auto" ? (projectTtsVoice || "Kore") : input.audioVoice);
      const stylePrefix = input.stylePrefix;
      const allNarrations = scenes.map((scene) => (scene.narration || scene.title || "").trim()).filter(Boolean);
      const fullProjectText = stylePrefix
        ? `${stylePrefix}\n\n${allNarrations.join(ttsSceneSeparator())}`
        : allNarrations.join(ttsSceneSeparator());
      const shouldUseSingleRequest = fullProjectText.length > 0 && fullProjectText.length <= TTS_SINGLE_REQUEST_CHAR_LIMIT;
      const effectiveAudioMode = requestedAudioMode === "per-sentence"
        ? "per-sentence"
        : (shouldUseSingleRequest ? "single-request" : "smart-batches");

      if (effectiveAudioMode === "single-request") {
        const base64Data = await callGeminiTts(fullProjectText, autoVoice, input.audioModel, apiKeys, status);
        const { samples, sampleRate } = await decodePcmBase64ToFloat32(base64Data);
        standaloneFullAudio = createAudioArtifactFromSamples(samples, sampleRate);
        try {
          const charCounts = allNarrations.map((n) => n.length || 1);
          const segments = scenes.length === 1
            ? [samples]
            : await alignedOrRatioSplit(samples, sampleRate, charCounts, allNarrations);
          scenes.forEach((scene, index) => {
            const seg = segments[index] || segments[segments.length - 1] || samples;
            standaloneSceneAudios[index] = createAudioArtifactFromSamples(seg, sampleRate);
          });
        } catch (splitErr) {
          console.error(splitErr);
          scenes.forEach((scene, index) => {
            standaloneSceneAudios[index] = { wavUrl: "", base64Data: "", error: "split_failed_full_audio_available" };
          });
        }
        renderStandaloneAudioList();
      } else if (effectiveAudioMode === "smart-batches") {
        const batches = createSmartAudioBatches(scenes, TTS_BATCH_CHAR_LIMIT);
        let processedBatches = 0;
        let generatedScenes = 0;
        const projectBatchSegments = [];
        let splitFallbackUsed = false;
        for (const batch of batches) {
          throwIfStopRequested();
          const narrations = batch.map((item) => item.text);
          const combinedText = stylePrefix
            ? `${stylePrefix}\n\n${narrations.join(ttsSceneSeparator())}`
            : narrations.join(ttsSceneSeparator());
          try {
            status.textContent = `الاستوديو المستقل: دفعة ${processedBatches + 1} / ${batches.length}`;
            const base64Data = await callGeminiTts(combinedText, autoVoice, input.audioModel, apiKeys, status);
            const { samples, sampleRate } = await decodePcmBase64ToFloat32(base64Data);
            projectBatchSegments.push(samples);
            try {
              const charCounts = narrations.map((n) => n.length || 1);
              const segments = batch.length === 1
                ? [samples]
                : await alignedOrRatioSplit(samples, sampleRate, charCounts, narrations);
              batch.forEach((item, localIndex) => {
                const seg = segments[localIndex] || segments[segments.length - 1] || samples;
                standaloneSceneAudios[item.index] = createAudioArtifactFromSamples(seg, sampleRate);
                generatedScenes += 1;
              });
            } catch (splitErr) {
              console.error(splitErr);
              splitFallbackUsed = true;
              batch.forEach((item) => {
                standaloneSceneAudios[item.index] = { wavUrl: "", base64Data: "", error: "split_failed_full_audio_available" };
              });
            }
          } catch (err) {
            if (isStopError(err)) throw err;
            console.error(err);
            batch.forEach((item) => {
              standaloneSceneAudios[item.index] = { wavUrl: "", base64Data: "", error: err.message };
            });
          }
          processedBatches += 1;
          renderStandaloneAudioList();
          status.textContent = `تم إنهاء ${processedBatches} / ${batches.length} دفعة | ${generatedScenes} / ${scenes.length} عنصر`;
          if (processedBatches < batches.length) {
            await waitWithStop(TTS_BATCH_PAUSE_MS);
          }
        }
        if (projectBatchSegments.length === batches.length) {
          const mergedSamples = concatFloat32Arrays(projectBatchSegments);
          if (mergedSamples.length) standaloneFullAudio = createAudioArtifactFromSamples(mergedSamples, 24000);
        }
        if (splitFallbackUsed && standaloneFullAudio?.wavUrl) {
          status.textContent = "تم الاحتفاظ بالصوت الكامل كنسخة احتياطية في الاستوديو المستقل.";
        }
      } else {
        let completed = 0;
        let nextIndex = 0;
        const concurrency = input.audioParallel;
        async function audioWorker() {
          while (nextIndex < scenes.length) {
            throwIfStopRequested();
            const idx = nextIndex++;
            const scene = scenes[idx];
            const text = stylePrefix
              ? `${stylePrefix}\n\n${(scene.narration || scene.title || "").trim()}`
              : (scene.narration || scene.title || "").trim();
            try {
              const base64Data = await callGeminiTts(text, autoVoice, input.audioModel, apiKeys, status);
              standaloneSceneAudios[idx] = { wavUrl: createWavDataUrl(base64Data), base64Data, error: "" };
            } catch (err) {
              if (isStopError(err)) throw err;
              console.error(err);
              standaloneSceneAudios[idx] = { wavUrl: "", base64Data: "", error: err.message };
            }
            completed++;
            renderStandaloneAudioList();
            status.textContent = `تم توليد ${completed} / ${scenes.length} عنصر صوتي`;
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, scenes.length) }, () => audioWorker()));
      }

      const successCount = standaloneSceneAudios.filter((a) => a?.wavUrl).length;
      status.textContent = standaloneFullAudio?.wavUrl
        ? `اكتمل الاستوديو المستقل: ${successCount} / ${scenes.length} ملف + ملف كامل.`
        : `اكتمل الاستوديو المستقل: ${successCount} / ${scenes.length} ملف.`;
      renderStandaloneAudioList();
      syncStandaloneRunButtons();
      return true;
    } catch (error) {
      if (isStopError(error)) {
        status.textContent = "تم إيقاف استوديو الصوت المستقل يدويًا.";
      } else {
        console.error(error);
        status.textContent = `حدث خطأ أثناء توليد الصوت المستقل: ${error.message}`;
      }
      syncStandaloneRunButtons();
      return false;
    } finally {
      runBtn.disabled = false;
      endManagedOperation();
    }
  }
  async function runFullPipeline() {
    const status = document.getElementById("pipelineStatus");
    const input = getProjectInput();
    clearStopRequest();
    beginManagedOperation();
    resetProject();
    setPipelineButtonsDisabled(true);
    setCurrentPhase("تشغيل كل المراحل");
    status.textContent = "بدأ التشغيل المدمج لكل المراحل...";
    try {
      const storyOk = await runStoryPipeline({ skipReset: true, managedByRunAll: true });
      if (!storyOk) { status.textContent = stopRequested ? "تم إيقاف التشغيل المدمج أثناء المرحلة الأولى." : "توقف التشغيل المدمج عند المرحلة الأولى."; return; }
      const productionOk = await runProductionPipeline({ managedByRunAll: true });
      if (!productionOk) { status.textContent = stopRequested ? "تم إيقاف التشغيل المدمج أثناء المرحلة الثانية." : "توقف التشغيل المدمج عند المرحلة الثانية."; return; }
      const skipImages = input.skipImageStage && input.audioEnabled;
      if (skipImages) {
        // تخطّي توليد الصور: نجهّز البطاقات من مرحلة الإنتاج ثم نولّد الصوت أولًا
        prepareAssetsPlaceholders();
        status.textContent = "تم تخطّي الصور — جارٍ توليد الصوت أولًا للمراجعة...";
        const audioOk = await runAudioPipeline({ managedByRunAll: true });
        if (!audioOk) { status.textContent = stopRequested ? "تم إيقاف التشغيل المدمج أثناء مرحلة الصوت." : "اكتملت المراحل 1-2. فشلت مرحلة الصوت."; return; }
        setCurrentPhase("الصوت جاهز — بانتظار الصور");
        status.textContent = "اكتمل الصوت. راجِع المشاهد ثم اضغط «مرحلة الصور» لتوليد الصور.";
        return;
      }
      const assetsOk = await runAssetsPipeline({ managedByRunAll: true });
      if (!assetsOk) { status.textContent = stopRequested ? "تم إيقاف التشغيل المدمج أثناء المرحلة الثالثة." : "توقف التشغيل المدمج عند المرحلة الثالثة."; return; }
      if (input.audioEnabled) {
        const audioOk = await runAudioPipeline({ managedByRunAll: true });
        if (!audioOk) { status.textContent = stopRequested ? "تم إيقاف التشغيل المدمج أثناء مرحلة الصوت." : "اكتملت المراحل 1-3. فشلت مرحلة الصوت."; return; }
      }
      setCurrentPhase("اكتمل المشروع");
      status.textContent = "اكتمل تشغيل كل المراحل بالترتيب بنجاح.";
    } finally {
      setPipelineButtonsDisabled(false);
      document.getElementById("downloadProjectBtn").disabled = !phaseOneProject;
      endManagedOperation();
    }
  }
  async function resumeRemainingPipeline() {
    const status = document.getElementById("pipelineStatus");
    const input = getProjectInput();
    if (!phaseOneProject && !input.title) {
      alert("اكتب عنوان القصة أولًا أو أكمل من مشروع بدأته بالفعل.");
      return false;
    }
    clearStopRequest();
    beginManagedOperation();
    setPipelineButtonsDisabled(true);
    setCurrentPhase("استكمال المراحل");
    status.textContent = "جارٍ فحص آخر مرحلة مكتملة ثم استكمال المشروع...";
    try {
      let nextPhase = getNextIncompletePhase();
      if (nextPhase === "done") {
        status.textContent = "كل المراحل مكتملة بالفعل.";
        setCurrentPhase("اكتمل المشروع");
        return true;
      }

      if (nextPhase === "story") {
        const storyOk = await runStoryPipeline({ managedByRunAll: true });
        if (!storyOk) { status.textContent = stopRequested ? "تم إيقاف الاستكمال أثناء المرحلة الأولى." : "توقف الاستكمال عند المرحلة الأولى."; return false; }
        nextPhase = getNextIncompletePhase();
      }
      if (nextPhase === "production") {
        const productionOk = await runProductionPipeline({ managedByRunAll: true });
        if (!productionOk) { status.textContent = stopRequested ? "تم إيقاف الاستكمال أثناء المرحلة الثانية." : "توقف الاستكمال عند المرحلة الثانية."; return false; }
        nextPhase = getNextIncompletePhase();
      }
      if (nextPhase === "assets") {
        const assetsOk = await runAssetsPipeline({ managedByRunAll: true });
        if (!assetsOk) { status.textContent = stopRequested ? "تم إيقاف الاستكمال أثناء المرحلة الثالثة." : "توقف الاستكمال عند المرحلة الثالثة."; return false; }
        nextPhase = getNextIncompletePhase();
      }
      if (nextPhase === "audio") {
        const audioOk = await runAudioPipeline({ managedByRunAll: true });
        if (!audioOk) { status.textContent = stopRequested ? "تم إيقاف الاستكمال أثناء المرحلة الرابعة." : "توقف الاستكمال عند المرحلة الرابعة."; return false; }
      }

      setCurrentPhase("اكتمل المشروع");
      status.textContent = "تم استكمال كل المراحل المتبقية بنجاح.";
      return true;
    } finally {
      setPipelineButtonsDisabled(false);
      document.getElementById("downloadProjectBtn").disabled = !phaseOneProject;
      endManagedOperation();
    }
  }
  // ─── تحميل الملفات ────────────────────────────────────────────────────────
  function downloadTextFile(fileName, content) {
    saveAs(new Blob([content], { type: "text/plain;charset=utf-8" }), fileName);
  }
  function downloadSceneImage(index) {
    const asset = sceneAssets[index];
    const scene = productionPack[index] || phaseOneProject?.scenes?.[index];
    if (!asset?.imageData || !scene) return;
    saveAs(asset.imageData, `scene_${String(scene.scene_number).padStart(2, "0")}.png`);
  }
  function downloadSceneMotionFile(index) {
    const asset = sceneAssets[index];
    const scene = productionPack[index] || phaseOneProject?.scenes?.[index];
    if (!asset?.motionText || !scene) return;
    downloadTextFile(`scene_${String(scene.scene_number).padStart(2, "0")}_motion.txt`, asset.motionText);
  }
  function downloadSceneAudio(index) {
    const audio = sceneAudios[index];
    const scene = phaseOneProject?.scenes?.[index];
    if (!audio?.wavUrl || !scene) return;
    saveAs(audio.wavUrl, `scene_${String(scene.scene_number).padStart(2, "0")}_audio.wav`);
  }
  function downloadFullProjectAudio() {
    if (!fullProjectAudio?.wavUrl || !phaseOneProject) return;
    saveAs(fullProjectAudio.wavUrl, `full_project_audio_${phaseOneProject.title || "story"}.wav`);
  }
  function downloadStandaloneSceneAudio(index) {
    const audio = standaloneSceneAudios[index];
    const item = standaloneAudioSource.items[index];
    if (!audio?.wavUrl || !item) return;
    saveAs(audio.wavUrl, `standalone_audio_${String(item.scene_number || index + 1).padStart(2, "0")}.wav`);
  }
  function downloadStandaloneFullAudio() {
    if (!standaloneFullAudio?.wavUrl) return;
    const base = standaloneAudioSource.fileName ? standaloneAudioSource.fileName.replace(/\.[^.]+$/, "") : "standalone_audio";
    saveAs(standaloneFullAudio.wavUrl, `${base}_full_audio.wav`);
  }
  function downloadStandaloneAudioBundle() {
    if (!standaloneAudioSource.items.length) { alert("لا توجد عناصر صوتية جاهزة."); return; }
    const zip = new JSZip();
    const root = zip.folder("story_studio_audio_only_v37");
    root.file("source_items.json", JSON.stringify(standaloneAudioSource.items, null, 2));
    const audioFolder = root.folder("audio");
    standaloneAudioSource.items.forEach((item, index) => {
      root.file(`item_${String(item.scene_number || index + 1).padStart(2, "0")}.txt`, item.narration || "");
      const audio = standaloneSceneAudios[index];
      if (audio?.wavUrl) {
        audioFolder.file(`item_${String(item.scene_number || index + 1).padStart(2, "0")}.wav`, audio.wavUrl.split(",")[1], { base64: true });
      }
    });
    if (standaloneFullAudio?.wavUrl) {
      audioFolder.file("full_audio.wav", standaloneFullAudio.wavUrl.split(",")[1], { base64: true });
    }
    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "story_studio_audio_only_v37.zip");
    });
  }
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function scrollToBottom() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }
  function scrollToStandaloneAudioStudio() {
    const section = document.querySelector('[data-card-key="standalone-audio-studio"]');
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function downloadProjectBundle() {
    if (!phaseOneProject) { alert("لا توجد بيانات جاهزة للتحميل."); return; }
    const zip = new JSZip();
    const root = zip.folder("story_studio_project_v37");
    const scenesFolder = root.folder("scenes");
    root.file("01_concept.json", JSON.stringify(phaseOneProject.concept, null, 2));
    root.file("02_story_bible.json", JSON.stringify(phaseOneProject.bible, null, 2));
    root.file("03_full_story.json", JSON.stringify(phaseOneProject.story, null, 2));
    if (productionPack.length) root.file("04_scene_production_packs.json", JSON.stringify(productionPack, null, 2));
    if (phaseThreePlan.length) root.file("05_phase_three_plan.json", JSON.stringify(phaseThreePlan, null, 2));
    root.file("00_project_overview.txt", [
      `Title: ${phaseOneProject.title}`,
      `Language: ${phaseOneProject.language}`,
      `Dialect: ${phaseOneProject.dialect || ""}`,
      `Writing Style: ${phaseOneProject.writingStyle || ""}`,
      `Era: ${phaseOneProject.era}`,
      `Genre: ${phaseOneProject.genre}`,
      "",
      "Story Summary:",
      phaseOneProject.story.story_summary || "",
      "",
      "Full Story:",
      phaseOneProject.story.full_story || ""
    ].join("\n"));
    phaseOneProject.scenes.forEach((scene) => {
      scenesFolder.file(
        `scene_${String(scene.scene_number).padStart(2, "0")}.txt`,
        [`Scene ${scene.scene_number}: ${scene.title}`, `Duration: ${scene.duration_seconds || 5}s`, "", scene.narration || ""].join("\n")
      );
    });
    if (productionPack.length) {
      const productionFolder = root.folder("scene_production_packs");
      productionPack.forEach((pack) => {
        productionFolder.file(
          `scene_${String(pack.scene_number).padStart(2, "0")}_pack.txt`,
          [`Scene ${pack.scene_number}: ${pack.title}`, `Duration: ${pack.duration_seconds || 5}s`, "", "Visual Prompt:", pack.visual_prompt || "", "", "Motion Prompt:", pack.motion_prompt || "", "", "Camera Direction:", pack.camera_direction || "", "", "Continuity Notes:", pack.continuity_notes || ""].join("\n")
        );
      });
    }
    if (sceneAssets.length) {
      const motionFolder = root.folder("motion_files");
      const imagesFolder = root.folder("images");
      const audioFolder = root.folder("audio");
      sceneAssets.forEach((asset, index) => {
        const scene = productionPack[index] || phaseOneProject.scenes[index];
        if (!scene) return;
        if (asset.motionText) {
          motionFolder.file(`scene_${String(scene.scene_number).padStart(2, "0")}_motion.txt`, asset.motionText);
        }
        if (asset.imageData) {
          imagesFolder.file(`scene_${String(scene.scene_number).padStart(2, "0")}.png`, asset.imageData.split(",")[1], { base64: true });
        }
        const audio = sceneAudios[index];
        if (audio?.base64Data) {
          const wavBase64 = audio.wavUrl.split(",")[1];
          audioFolder.file(`scene_${String(scene.scene_number).padStart(2, "0")}_audio.wav`, wavBase64, { base64: true });
        }
      });
      if (fullProjectAudio?.wavUrl) {
        audioFolder.file("full_project_audio.wav", fullProjectAudio.wavUrl.split(",")[1], { base64: true });
      }
    }
    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "story_studio_v37_bundle.zip");
    });
  }
  // تنقل التبويبات + صفحة الإعدادات
  function switchToTab(tid) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tid));
    document.querySelectorAll('.panel-view').forEach((v) => v.classList.toggle('active', v.id === ('view-' + tid)));
  }
  function openSettings() { const o = document.getElementById('settingsOverlay'); if (o) o.classList.add('open'); }
  function closeSettings() { const o = document.getElementById('settingsOverlay'); if (o) o.classList.remove('open'); }
  // ─── تهيئة ────────────────────────────────────────────────────────────────
  const _fixedStatus = document.getElementById("fixedStatus");
  const _pipelineStatus = document.getElementById("pipelineStatus");
  new MutationObserver(() => {
    const txt = _pipelineStatus.textContent.trim();
    _fixedStatus.textContent = txt;
    _fixedStatus.classList.toggle("visible", txt.length > 0);
  }).observe(_pipelineStatus, { childList: true, characterData: true, subtree: true });

  aiProviderSettings = loadAiProviderSettings();
  syncAiProviderUi();
  updateAiProviderStatus("Gemini Direct API — المزود الحالي للنصوص والصوت.");
  updateDialectOptions();
  syncAudioUi();
  syncCreativeControlUi();
  syncOwnStoryUi();
  loadWhisperPref();
  loadSkipImagePref();
  loadPromptOverrides();
  renderPromptsEditor();
  loadRemotePrompts();
  loadRemoteConfig();
  populateStyleTestCheckboxes();
  syncAudioModeUi();
  populateStandaloneAudioVoiceOptions();
  copyMainAudioSettingsToStandalone();
  initializeCards();
  resetProject();
  resetStandaloneAudioStudio();
