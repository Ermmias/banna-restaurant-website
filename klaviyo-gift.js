/* Banna — floating gift / discount signup button wired to Klaviyo (company Yjj7RU).
   Click order of preference:
   1. If a Klaviyo popup form id is set (form-id attribute), open that form.
   2. Otherwise open an inline panel; submitting identifies the profile in Klaviyo
      (window.klaviyo.identify) and tracks a "Signed Up For Discount" event. */
(function () {
  if (customElements.get('klaviyo-gift')) return;

  class KlaviyoGift extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const formId = this.getAttribute('form-id') || '';
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          :host{all:initial}
          *{box-sizing:border-box;font-family:Archivo,system-ui,sans-serif}
          .wrap{position:fixed;right:18px;bottom:18px;z-index:80;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
          button.fab{width:56px;height:56px;border-radius:50%;border:1px solid rgba(27,21,18,.14);background:#C7452B;color:#FFF7EA;
            display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 22px rgba(27,21,18,.28);padding:0}
          button.fab:hover{background:#A93720}
          button.fab:focus-visible{outline:3px solid #FFB84D;outline-offset:3px}
          .panel{width:min(300px,calc(100vw - 36px));background:#FAF7F3;border:1px solid rgba(27,21,18,.14);border-radius:18px;
            box-shadow:0 14px 34px rgba(27,21,18,.22);padding:16px;color:#1B1512}
          .panel[hidden]{display:none}
          h3{margin:0 0 6px;font:700 17px/1.2 'Baloo 2',Archivo,system-ui,sans-serif}
          p{margin:0 0 12px;font:400 13px/1.5 Archivo,system-ui,sans-serif;color:#5A4A3C}
          form{display:flex;flex-direction:column;gap:8px}
          input{width:100%;min-height:44px;padding:10px 12px;border-radius:12px;border:1px solid rgba(27,21,18,.2);
            font:400 14px Archivo,system-ui,sans-serif;background:#fff;color:#1B1512}
          input:focus-visible{outline:2px solid #C7452B;outline-offset:1px}
          .submit{min-height:44px;border-radius:100px;border:none;background:#C7452B;color:#fff;font:600 14px Archivo,system-ui,sans-serif;cursor:pointer}
          .submit:hover{background:#A93720}
          .close{position:absolute;top:8px;right:10px;background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:#5A4A3C}
          .panel{position:relative}
          .msg{margin:8px 0 0;font:500 13px Archivo,system-ui,sans-serif;color:#2F6B3C}
          .fine{margin:8px 0 0;font:400 11.5px/1.4 Archivo,system-ui,sans-serif;color:#63513F}
          .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
          @media (prefers-reduced-motion:no-preference){button.fab{transition:background .2s ease,transform .2s ease}button.fab:hover{transform:translateY(-2px)}}
          /* phones: let Klaviyo's own popup handle signup */
          @media (max-width:640px){.wrap{display:none}}
        </style>
        <div class="wrap">
          <div class="panel" hidden role="dialog" aria-label="Get a discount by email">
            <button class="close" type="button" aria-label="Close discount signup">&times;</button>
            <h3>Join the Banna Discount Club</h3>
            <p>Sign up for exclusive discounts, rewards, and first access to Banna events.</p>
            <form>
              <label class="sr" for="kg-email">Email address</label>
              <input id="kg-email" type="email" name="email" required autocomplete="email" aria-label="Email address" placeholder="you@email.com">
              <button class="submit" type="submit">Join Banna Insiders</button>
            </form>
            <p class="msg" hidden role="status" aria-live="polite"></p>
            <p class="fine">By signing up you agree to receive marketing emails from Banna Restaurant &amp; Bar. Unsubscribe anytime.</p>
          </div>
          <button class="fab" type="button" aria-label="Sign up for a discount" aria-expanded="false">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <rect x="3" y="8" width="18" height="4" rx="1"></rect>
              <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"></path>
              <path d="M12 8v13"></path>
              <path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5h4z"></path>
              <path d="M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5h-4z"></path>
            </svg>
          </button>
        </div>`;

      const fab = root.querySelector('.fab');
      const panel = root.querySelector('.panel');
      const msg = root.querySelector('.msg');
      const form = root.querySelector('form');
      const input = root.querySelector('input');

      const setOpen = (open) => {
        panel.hidden = !open;
        fab.setAttribute('aria-expanded', String(open));
        if (open) input.focus();
      };

      // Prefer a real Klaviyo form: explicit form-id, else any form the
      // account's onsite script has rendered (class "klaviyo-form-XXXXXX").
      // Only route to a Klaviyo popup when an explicit form id is configured
      // (set form-id="XXXXXX" on <klaviyo-gift>); otherwise use our own panel.
      fab.addEventListener('click', () => {
        if (formId && window._klOnsite) {
          window._klOnsite.push(['openForm', formId]);
          return;
        }
        setOpen(panel.hidden);
      });
      root.querySelector('.close').addEventListener('click', () => { setOpen(false); fab.focus(); });
      this.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); fab.focus(); } });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!email) return;
        try {
          if (window.klaviyo) {
            window.klaviyo.identify({ $email: email, $source: 'Website gift button' });
            window.klaviyo.track('Signed Up For Discount', { source: 'Website gift button' });
          }
        } catch (err) { /* Klaviyo not loaded — still confirm to the guest */ }
        form.hidden = true;
        msg.hidden = false;
        msg.textContent = "You're in \u2014 watch your inbox for Banna Insider offers.";
      });
    }
  }
  customElements.define('klaviyo-gift', KlaviyoGift);
})();
