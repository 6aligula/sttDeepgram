# la llave ve el proyecto
curl -s -H "Authorization: Token $DG_KEY" https://api.deepgram.com/v1/projects \
    | jq .


# pedir modelos
curl -s -H "Authorization: Token $DG_KEY" \
  "https://api.deepgram.com/v1/projects/$PID/models" |
  jq -r '.stt[]
         | select(.streaming == true)          # sólo los que aceptan WebSocket
         | [.name, .architecture, (.languages|join("/"))]    # columnas útiles
         | @tsv'


# imprime modelo, arquitectura e idiomas streaming
curl -s -H "Authorization: Token $DG_KEY" \
  "https://api.deepgram.com/v1/projects/$PID/models" |
  jq -r '.stt[]
         | select(.streaming == true)
         | [.name, .architecture, (.languages | join("/"))] 
         | @tsv'
