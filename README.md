# GPT-4o-oIP

GPT-4o-oIP is designed to empower developers to create telephony use cases for state-of-the-art multimodal AI models with [Asterisk](https://en.wikipedia.org/wiki/Asterisk_(PBX)), a powerful open-source private branch exchange. This project aims to reduce setup time and cost by providing preconfigured containers that run locally without subscription. It currently supports Google DialogFlow ES, with future plans to incorporate OpenAI's GPT-4o and Kyutai's Moshi AI when they are released to developers.

# [Wiki](https://github.com/chris01b/GPT-4o-oIP/wiki)
Please see the project's wiki for installation, configuration, and usage instructions.

# Features

## AI Agent
- [ ] Still waiting on the release of GPT-4o by OpenAI
- [ ] Still waiting on the release of Moshi AI by Kyutai
- [x] Currently configured to work with [DialogFlow](https://cloud.google.com/dialogflow) ES by Google
  - Form-based bot builder
  - Natural language understanding (NLU) models
  - ~~One-click telephony integration~~ but you're here to run Asterisk locally, right?
  - Speech recognition and speech synthesis models
  - [40+ template agents](https://cloud.google.com/dialogflow/es/docs/agents-prebuilt) for building conversations for dining out, hotel booking, navigation, IoT, and more
  - Integration into popular channels, such as Google Assistant, Slack, Twitter, and others
  - Performance and custom dashboards
## Asterisk
- [Asterisk](http://www.asterisk.org/) powering IP PBX systems and VoIP gateways
- PrivateDial Lite, customizable Asterisk configuration based on [mlan](https://github.com/mlan)'s [PrivateDial](https://github.com/mlan/docker-asterisk/tree/master/src/privatedial)
- AutoBan, a built in intrusion detection and prevention system
- Additionally provide the [G.729](https://en.wikipedia.org/wiki/G.729) and [G.723.1](https://en.wikipedia.org/wiki/G.723.1) audio codecs
- Small image size based on [Alpine Linux](https://alpinelinux.org/)
- Automatic integration of [Let’s Encrypt](https://letsencrypt.org/) TLS certificates using the reverse proxy [Traefik](https://docs.traefik.io/)
- Persistent storage facilitated by configuration and run data being consolidated under `/srv`
- Container audio using the pulse socket of the host
- Use [runit](http://smarden.org/runit/), providing an init scheme and service supervision
- Health check
- Log directed to docker daemon with configurable level
- Multi-staged build providing the images `mini`, `base`, `full` and `xtra`
