# Agenti archiviati

Lettore, Spiegatore, Valutatore e Revisore non esistono più su Evolus
(verificato il 2026-10-14: l'API risponde 404 e `list_agents` mostra solo
Referto Mother agent e Referto Farmaci). Il Mother non ha più sub-agenti e
cerca i farmaci con la Web API `cercaFarmaci`.

I file restano qui come riferimento dei prompt. Gli `agentId` nelle intestazioni
non sono più validi: per riusarli bisogna ricreare l'agente su Evolus e
aggiornare l'id prima di lanciare `sincronizza_prompt.py`.
