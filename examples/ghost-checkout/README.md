# Ghost Checkout

Accept Lightning payments for your Ghost blog memberships.

## One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmoneydevkit%2Fmdk-checkout%2Ftree%2Fmdk-216%2Fexamples%2Fghost-checkout&env=MDK_ACCESS_TOKEN,MDK_MNEMONIC,GHOST_URL,GHOST_ADMIN_API_KEY&envDescription=MoneyDevKit%20and%20Ghost%20credentials&project-name=ghost-checkout&repository-name=ghost-checkout)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MDK_ACCESS_TOKEN` | Your MoneyDevKit access token |
| `MDK_MNEMONIC` | Your 12 or 24 word mnemonic for the Lightning wallet |
| `GHOST_URL` | Your Ghost site URL (e.g., `https://yourblog.ghost.io`) |
| `GHOST_ADMIN_API_KEY` | Ghost Admin API key (format: `id:secret`) |

## How It Works

1. Generate a signed checkout URL using `createCheckoutUrl`
2. Add the URL to your Ghost site with a `data-mdk` attribute
3. JavaScript injects the member's email into the URL
4. When a user pays, their Ghost membership is automatically updated

## Ghost Setup

### Step 1: Get a checkout link

1. Go to [moneydevkit.com](https://moneydevkit.com) and sign in
2. Create a subscription with your desired price
3. Copy the checkout link for your subscription

### Step 2: Add the script to Ghost

Go to **Settings > Code injection > Site Footer** and add:

```html
<script>
(function () {
  // ========== CONFIGURATION ==========
  var CHECKOUT_URL = 'http://localhost:3004/api/mdk?action=createCheckout&checkoutPath=%2Fcheckout&product=cmkmuzney000pad100adrw8qf&type=PRODUCTS&signature=b2dfa68d36fb40d7b836e16349d20e2fa822315e8d490dc5a0fe4c207ad92742';
  var GHOST_URL = 'https://mdktest.ghost.io';
  var BUTTON_TEXT = '⚡ Subscribe with Lightning';
  // ===================================

  var memberData = null;

  function getUrl(){ 
    var url = CHECKOUT_URL;
    url += '&successUrl=' + encodeURIComponent(window.location.href);
    if (memberData) {
      url += '&customer=' + encodeURIComponent(JSON.stringify(memberData));
    }
    return url;
  }

  function replace() {
    var btn = document.querySelector('.gh-post-upgrade-cta a.gh-btn:not([data-mdk])');
    if (!btn) return;
    var newBtn = document.createElement('a');
    newBtn.className = btn.className;
    newBtn.style.cssText = btn.style.cssText;
    newBtn.setAttribute('data-mdk', '1');
    newBtn.href = getUrl();
    newBtn.textContent = BUTTON_TEXT;
    newBtn.onclick = function (e) {
      if (newBtn.getAttribute('data-loading')) {
        e.preventDefault();
        return false;
      }
      newBtn.setAttribute('data-loading', '1');
      newBtn.textContent = 'Loading...';
      newBtn.style.opacity = '0.7';
      newBtn.style.pointerEvents = 'none';
      window.location.href = getUrl();
      return false;
    };
    btn.parentNode.replaceChild(newBtn, btn);
  }

  // Only activate if member is logged in
  fetch(GHOST_URL + '/members/api/member/', { credentials: 'include' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (member) {
      if (member && member.email) {
        memberData = { email: member.email };
        if (member.uuid) memberData.externalId = member.uuid;
        // Start replacing buttons only after we have member data
        setInterval(replace, 100);
      }
    })
    .catch(function () {});
})();
</script>
```
