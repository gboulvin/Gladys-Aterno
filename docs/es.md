# Aterno

Controle sus radiadores Aterno desde Gladys Assistant: temperatura deseada,
encendido/apagado, antihielo, boost, con la temperatura ambiente, la
detección de ventana abierta y la detección de presencia de cada radiador.

La integración se comunica con la **box Eco Aterno**, la pequeña caja blanca
conectada a su router de Internet que usa la aplicación móvil Eco Aterno. No
está afiliada a Aterno ni cuenta con su aprobación.

## Qué obtiene

Un dispositivo de Gladys por cada radiador asociado a la box. Según el
modelo, un radiador ofrece:

- **Temperatura deseada**: la consigna, ajustable;
- **Temperatura ambiente**: medida por el radiador;
- **Calefacción**: en marcha o apagada;
- **Antihielo**: un interruptor; activado, mantiene la habitación justo por
  encima de la congelación; desactivado, vuelve la calefacción normal;
- **Boost**: en los modelos de baño;
- **Ventana**: abierta o cerrada, cuando el radiador lo detecta;
- **Presencia**: cuando el radiador la detecta.

Los cambios hechos desde la aplicación Eco Aterno o desde un termostato
aparecen en Gladys en unos segundos: la box los comunica en directo.

## Requisitos

- Una **box Eco Aterno**, alimentada y conectada a su router con su cable
  Ethernet.
- Sus radiadores ya **asociados a la box** en la aplicación Eco Aterno: la
  integración no asocia radiadores, usa los que la box conoce.
- La **dirección MAC** de la box (12 caracteres, impresos en su parte
  trasera) y la **contraseña** elegida al añadir la residencia en la
  aplicación.
- Gladys Assistant **5.1.0** o posterior.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca la **dirección MAC** de la box. Los separadores (`:` o `-`) se
   ignoran.
3. Introduzca la **contraseña** de la box.
4. Opcional: introduzca la **dirección IP local** de la box. Si se deja
   vacía, la integración busca la box en su red (véase más abajo).
5. Guarde y pulse **Probar la conexión**: la respuesta indica el canal usado
   y cuántos radiadores se han encontrado.
6. Abra la pestaña **Descubrimiento** y añada sus radiadores.

El **idioma de los nombres de dispositivos** solo se aplica a las funciones
creadas a partir de entonces; después puede renombrar lo que quiera en Gladys.

### Local o nube

Se puede acceder a la box de dos formas, y la integración gestiona ambas:

- **Local**: directamente por su red doméstica. Más rápido, y sigue
  funcionando cuando su acceso a Internet falla.
- **Nube**: a través del relé del fabricante, como la aplicación móvil fuera
  de casa. Nada que configurar, pero hace falta Internet en ambos lados.

No hace falta buscar la dirección de la box: si el campo **dirección IP
local** se deja vacío, la integración pide a Gladys que busque la box en su
red (como hace la aplicación Eco Aterno en casa), comprueba que es la suya
con la dirección MAC y la contraseña, y se conecta en local. Si su router le
asigna más adelante otra dirección, la integración la vuelve a encontrar por
sí sola. Si no se encuentra la box, pasa por la nube.

Aun así puede introducir la dirección, por ejemplo si la búsqueda no
encuentra nada en su red: búsquela en la lista de dispositivos conectados de
su router y resérvela allí (una «asignación DHCP estática») para que nunca
cambie. Una dirección introducida a mano se prueba primero; si deja de
responder, la búsqueda toma el relevo.

La opción **Preferir la conexión local** decide qué canal se prueba primero.
Si el canal preferido no responde, la integración usa el otro y lo indica:
la insignia de los radiadores muestra un punto naranja, con el motivo en su
descripción emergente. Vuelve por sí sola al canal preferido en cuanto este
responde de nuevo.

### Acciones

- **Probar la conexión**: se conecta a la box e indica el canal usado y el
  número de radiadores.
- **Buscar nuevos radiadores**: vuelve a leer la lista de radiadores, tras
  asociar o renombrar uno en la aplicación Eco Aterno.

## Escenas

La integración añade sus propias tarjetas al editor de escenas, en la
categoría **Integraciones**.

Disparadores:

- **Modo de un radiador cambiado**: un radiador se ha encendido, apagado o
  puesto en antihielo desde la aplicación Eco Aterno o su termostato. Los
  cambios hechos por la propia Gladys no lo disparan: una escena no puede
  entrar en bucle consigo misma.
- **Fallo en un radiador**: un radiador señala un fallo (sonda de
  temperatura, calefacción, pila baja del termostato).
- **Conexión con la box cambiada**: la conexión con la box se ha perdido,
  restablecido o ha cambiado entre local y nube.

Las temperaturas, la ventana y la presencia son funciones de dispositivo:
use para ellas el disparador estándar «cambio de estado de un dispositivo»
de Gladys.

Acciones:

- **Ajustar la temperatura deseada**: de un radiador, o de todos si no se
  elige ninguno.
- **Cambiar el modo de calefacción**: en marcha, apagado o antihielo, para
  un radiador o para todos.
- **Iniciar o detener el boost**: los radiadores sin boost se omiten.
- **Actualizar los radiadores**: vuelve a leer todos los valores ahora.

Cada acción devuelve cuántos radiadores ha modificado, para las acciones
siguientes de la escena.

## Panel

Hay dos widgets disponibles en el editor del panel:

- **Calefacción Aterno**: cuántos radiadores están en marcha, la temperatura
  media, la conexión, las ventanas abiertas y los fallos, con botones para
  poner todos los radiadores en marcha, apagados o en antihielo.
- **Radiador Aterno**: un radiador de su elección: temperaturas en directo,
  modo, ventana, presencia, y botones de más calor, menos calor,
  encendido/apagado y boost.

## Solución de problemas

**«La box ha rechazado la dirección MAC o la contraseña.»** Compruebe los 12
caracteres de la dirección MAC en la parte trasera de la box. Si ya no
recuerda la contraseña: mantenga pulsado el botón de la box durante 30
segundos (su piloto parpadea rápidamente en magenta) y elija después una
nueva contraseña en la aplicación Eco Aterno.

**«No se puede acceder a la box Eco Aterno.»** Mire el piloto de la box:
verde fijo significa accesible en local y a distancia; naranja, solo en
local; rojo, sin conexión a Internet. Si tampoco se puede acceder a la
box en la red local, la integración necesita el piloto verde.

**La insignia indica «nube» con un punto naranja.** La box no ha respondido
en la red local y la búsqueda no la ha vuelto a encontrar. Compruebe que la
box y Gladys están en la misma red e introduzca después su dirección a mano
(véase «Local o nube»).

**Falta un radiador.** Asócielo primero en la aplicación Eco Aterno y pulse
después **Buscar nuevos radiadores**.

**Otra cosa.** Abra los registros de la integración en Gladys. Nunca
contienen su contraseña.

## Conviene saber

- Es una integración comunitaria, construida a partir del protocolo de la
  box (una pasarela Delta Dore Tydom bajo la marca Aterno). Se ha
  desarrollado frente a una box simulada: sus comentarios con material real
  son bienvenidos en el repositorio.
- Se ha escrito para la box Eco Aterno. La antigua box My Aterno no se ha
  probado.
- Las programaciones de calefacción («momentos») permanecen en la aplicación
  Eco Aterno; cree las suyas con escenas de Gladys si lo prefiere.
