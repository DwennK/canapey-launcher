# Application logos

Retrieved on 2026-10-20. These bundled assets identify the corresponding applications;
they are not Canapey artwork and do not imply endorsement. Their trademarks remain
the property of their respective owners. Do not apply Canapey's artwork license to them.
No remote logo request is made when the launcher runs.

| File | Primary source | Adaptation |
| --- | --- | --- |
| `netflix.svg` | [Netflix homepage](https://www.netflix.com/) (`svg.n-logo-svg`); [brand guidance](https://brand.netflix.com/en/assets/logos/) | Extracted the official N symbol; added standalone SVG namespace, removed page-only root attributes. Paths, gradients and colors unchanged. |
| `youtube.svg` | [Google's YouTube asset](https://developers.google.com/static/site-assets/logo-youtube.svg); [brand resources](https://brand.youtube/) | Unmodified SVG icon. |
| `spotify.png` | [Spotify newsroom brand kit](https://newsroom.spotify.com/media-kit/logo-and-brand-assets/), [full green logo](https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Full_Logo_RGB_Green.png) | Unmodified PNG. |
| `steam.svg` | [Steam store](https://store.steampowered.com/), [header logo](https://store.fastly.steamstatic.com/public/shared/images/header/logo_steam.svg?t=962016) | SVG wordmark; trailing whitespace removed, artwork unchanged. |
| `plezy.svg` | [Plezy official repository, favicon.svg at 002df7b988e26ed791df5ab3967c3f11e7fa5dc0](https://github.com/edde746/plezy/blob/002df7b988e26ed791df5ab3967c3f11e7fa5dc0/website/src/lib/assets/favicon.svg) | Unmodified SVG icon. |
| `silo.svg` | [Silo official website](https://siloserver.org/), [white wordmark](https://siloserver.org/brand/silo-wordmark-white.svg) | Unmodified SVG wordmark. |

The Windows-discovered application icon takes priority for every background theme.
When it is absent or fails to load, an exact known application name selects a bundled
logo. An unknown app keeps a plain text label;
Internet remains a generic browser entry. A background theme never assigns an app's
identity. The settings preview follows the same rules as the home cards.
