package com.calorietrack.dev

import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {

  // 回调处理返回按钮：优先发送事件给前端，前端返回"exit-app"时才真正退出
  private val backPressedCallback = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      val webView = getWebView()
      if (webView != null) {
        // 触发前端自定义事件：通过JS派发CustomEvent
        webView.evaluateJavascript(
          """
          (function() {
            var ev = new CustomEvent('back-button-pressed', { detail: { type: 'back-button-pressed', source: 'android' } });
            window.dispatchEvent(ev);
            // 兼容另一个事件名
            var ev2 = new CustomEvent('tauri://event', { detail: { type: 'back-button-pressed', source: 'android' } });
            window.dispatchEvent(ev2);
          })();
          """.trimIndent(),
          null
        )
      } else {
        // WebView还没初始化，按默认行为
        if (isEnabled) {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
        }
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // 1. 启用沉浸式（Edge-to-Edge）：让内容延伸到状态栏区域
    enableEdgeToEdge()

    // 2. 确保状态栏透明（兼容性处理）
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      window.statusBarColor = android.graphics.Color.TRANSPARENT
      window.navigationBarColor = android.graphics.Color.TRANSPARENT
    }

    super.onCreate(savedInstanceState)

    // 3. 注册返回按钮回调（使用OnBackPressedDispatcher，已废弃onBackPressed）
    onBackPressedDispatcher.addCallback(this, backPressedCallback)

    // 4. 注册"app-exit-request"：前端请求退出时真正关闭Activity
    registerExitRequestHandler()
  }

  override fun onResume() {
    super.onResume()
    // 将状态栏高度注入前端JS（每次回到前台重新计算，应对旋转屏等）
    injectStatusBarHeight()
  }

  /**
   * 计算状态栏高度（像素）并注入到前端 WebView JS 变量中
   * 前端通过 window.__STATUS_BAR_HEIGHT__ 获取，
   * 同时也会设置 CSS 变量 --status-bar-height（前端兜底逻辑）
   */
  private fun injectStatusBarHeight() {
    val webView = getWebView() ?: return
    val statusBarHeightPx = getStatusBarHeight()
    webView.evaluateJavascript(
      """
      (function() {
        window.__STATUS_BAR_HEIGHT__ = $statusBarHeightPx;
        // 更新 CSS 变量兜底
        var root = document.documentElement;
        if (root) {
          root.style.setProperty('--status-bar-height', '${statusBarHeightPx}px');
          root.style.setProperty('--safe-area-top', 'max(env(safe-area-inset-top, 0px), ${statusBarHeightPx}px)');
          root.style.setProperty('--page-top-padding', 'max(env(safe-area-inset-top, 0px), ${statusBarHeightPx}px)');
        }
        // 如果前端uiStore存在，则也更新（通过CustomEvent触发）
        var ev = new CustomEvent('status-bar-height-updated', { detail: { heightPx: $statusBarHeightPx } });
        window.dispatchEvent(ev);
      })();
      """.trimIndent(),
      null
    )
  }

  /**
   * 获取状态栏高度（单位：像素 px）
   */
  private fun getStatusBarHeight(): Int {
    val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resourceId > 0) {
      resources.getDimensionPixelSize(resourceId)
    } else {
      // 兜底：使用 24dp 转 px
      val dm = resources.displayMetrics
      TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 24f, dm).toInt()
    }
  }

  /**
   * 获取当前WebView实例（从WryActivity继承）
   */
  private fun getWebView(): WebView? {
    return try {
      val field = WryActivity::class.java.getDeclaredField("webView")
      field.isAccessible = true
      field.get(this) as? WebView
    } catch (_: Exception) {
      null
    }
  }

  /**
   * 注册前端请求退出应用的处理器
   * 前端通过 emit('app-exit-request') 或 CustomEvent('app-exit-request') 触发
   */
  private fun registerExitRequestHandler() {
    val webView = getWebView() ?: return
    // 通过 JS 接口注入：window.__APP_EXIT__ = finish
    webView.evaluateJavascript(
      """
      (function() {
        window.__APP_EXIT__ = function() {
          // 由 evaluateJavascript 返回值在 native 端捕获效果有限，改用 JSInterface 或事件轮询
        };
        // 监听前端 CustomEvent
        window.addEventListener('app-exit-request', function() {
          // 触发 Android 端执行 finish() —— 这里通过一个特殊的 console 消息或 URL scheme 触发
          window.location.href = 'tauri-app://exit';
        });
      })();
      """.trimIndent(),
      null
    )

    // 拦截 URL scheme：tauri-app://exit -> 关闭Activity
    webView.webViewClient = object : android.webkit.WebViewClient() {
      override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: android.webkit.WebResourceRequest?
      ): Boolean {
        val url = request?.url?.toString() ?: return false
        if (url.startsWith("tauri-app://exit")) {
          finish()
          return true
        }
        return super.shouldOverrideUrlLoading(view, request)
      }
    }
  }
}
