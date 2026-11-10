# Aterno

Pilotez vos radiateurs Aterno depuis Gladys Assistant : température
demandée, marche/arrêt, hors-gel, boost, avec la température ambiante, la
détection de fenêtre ouverte et la détection de présence de chaque radiateur.

L'intégration dialogue avec la **box Eco Aterno** — le petit boîtier blanc
relié à votre box Internet, celui qu'utilise l'application mobile Eco Aterno.
Elle n'est ni affiliée à Aterno, ni approuvée par Aterno.

## Ce que vous obtenez

Un appareil Gladys par radiateur associé à la box. Selon le modèle, un
radiateur propose :

- **Température demandée** — la consigne, réglable ;
- **Température ambiante** — mesurée par le radiateur ;
- **Chauffage** — en marche ou à l'arrêt ;
- **Hors-gel** — un interrupteur : activé, la pièce reste juste au-dessus du
  gel ; désactivé, le chauffage normal reprend ;
- **Boost** — sur les modèles salle de bain ;
- **Fenêtre** — ouverte ou fermée, quand le radiateur la détecte ;
- **Présence** — quand le radiateur la détecte.

Les changements faits depuis l'application Eco Aterno ou depuis un
thermostat apparaissent dans Gladys en quelques secondes : la box les signale
en direct.

## Prérequis

- Une **box Eco Aterno**, alimentée et reliée à votre box Internet par son
  câble Ethernet.
- Vos radiateurs déjà **associés à la box** dans l'application Eco Aterno :
  l'intégration n'associe pas de radiateurs, elle utilise ceux que la box
  connaît.
- L'**adresse MAC** de la box (12 caractères, inscrits au dos) et le **mot
  de passe** choisi à l'ajout de la résidence dans l'application.
- Gladys Assistant **5.1.0** ou plus récent.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**adresse MAC** de la box. Les séparateurs (`:` ou `-`) sont
   ignorés.
3. Saisissez le **mot de passe** de la box.
4. Facultatif mais conseillé : saisissez l'**adresse IP locale** de la box
   (voir ci-dessous).
5. Enregistrez, puis appuyez sur **Tester la connexion** : la réponse indique
   le canal utilisé et le nombre de radiateurs trouvés.
6. Ouvrez l'onglet **Découverte** et ajoutez vos radiateurs.

La **langue des noms d'appareils** ne s'applique qu'aux fonctionnalités
créées ensuite ; renommez ce que vous voulez dans Gladys par la suite.

### Local ou cloud

La box est joignable de deux façons, et l'intégration gère les deux :

- **Local** — directement par votre réseau domestique. Plus rapide, et cela
  continue de fonctionner quand votre accès Internet est coupé. Il faut
  l'adresse IP locale de la box : trouvez-la dans la liste des appareils
  connectés de votre box Internet, et réservez-la (un « bail DHCP statique »)
  pour qu'elle ne change jamais.
- **Cloud** — par le relais du fabricant, comme l'application mobile hors de
  chez vous. Rien à configurer, mais il faut Internet des deux côtés.

Une fois l'adresse renseignée, l'option **Préférer la connexion locale**
décide du canal essayé en premier. Si le canal préféré ne répond pas,
l'intégration utilise l'autre et le signale : le badge des radiateurs affiche
un point orange, avec la raison dans son infobulle. Elle revient d'elle-même
au canal préféré dès qu'il répond à nouveau.

### Actions

- **Tester la connexion** — se connecte à la box et indique le canal utilisé
  et le nombre de radiateurs.
- **Rechercher de nouveaux radiateurs** — relit la liste des radiateurs,
  après en avoir associé ou renommé un dans l'application Eco Aterno.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes, dans la
catégorie **Intégrations**.

Déclencheurs :

- **Mode d'un radiateur modifié** — un radiateur a été mis en marche, à
  l'arrêt ou en hors-gel depuis l'application Eco Aterno ou son thermostat.
  Les changements faits par Gladys elle-même ne le déclenchent pas : une
  scène ne peut pas boucler sur elle-même.
- **Défaut sur un radiateur** — un radiateur signale un défaut (sonde de
  température, chauffe, pile faible du thermostat).
- **Connexion à la box modifiée** — la connexion à la box a été perdue,
  rétablie, ou a basculé entre local et cloud.

Les températures, la fenêtre et la présence sont des fonctionnalités
d'appareil : utilisez pour elles le déclencheur standard « changement d'état
d'un appareil » de Gladys.

Actions :

- **Régler la température demandée** — d'un radiateur, ou de tous si aucun
  n'est choisi.
- **Changer le mode de chauffage** — marche, arrêt ou hors-gel, pour un
  radiateur ou pour tous.
- **Lancer ou arrêter le boost** — les radiateurs sans boost sont ignorés.
- **Actualiser les radiateurs** — relit toutes les valeurs maintenant.

Chaque action renvoie le nombre de radiateurs modifiés, utilisable par les
actions suivantes de la scène.

## Tableau de bord

Deux widgets sont disponibles dans l'éditeur de tableau de bord :

- **Chauffage Aterno** — le nombre de radiateurs en marche, la température
  moyenne, la connexion, les fenêtres ouvertes et les défauts, avec des
  boutons pour mettre tous les radiateurs en marche, à l'arrêt ou en hors-gel.
- **Radiateur Aterno** — un radiateur de votre choix : températures en
  direct, mode, fenêtre, présence, et des boutons plus chaud, moins chaud,
  marche/arrêt et boost.

## Dépannage

**« La box a refusé l'adresse MAC ou le mot de passe. »** Vérifiez les 12
caractères de l'adresse MAC au dos de la box. Si vous ne connaissez plus le
mot de passe : maintenez le bouton de la box 30 secondes (son voyant clignote
rapidement en magenta), puis choisissez un nouveau mot de passe dans
l'application Eco Aterno.

**« La box Eco Aterno est injoignable. »** Regardez le voyant de la box :
vert fixe, elle est accessible en local et à distance ; orange, en local
uniquement ; rouge, pas de connexion Internet. Sans adresse IP locale dans la
configuration, l'intégration a besoin du voyant vert.

**Le badge indique « cloud » avec un point orange.** La box n'a pas répondu
à l'adresse IP locale : elle a probablement changé. Vérifiez-la dans votre
box Internet et réservez-la.

**Un radiateur manque.** Associez-le d'abord dans l'application Eco Aterno,
puis appuyez sur **Rechercher de nouveaux radiateurs**.

**Autre chose.** Ouvrez les journaux de l'intégration dans Gladys. Ils ne
contiennent jamais votre mot de passe.

## Bon à savoir

- C'est une intégration communautaire, construite à partir du protocole de
  la box (une passerelle Delta Dore Tydom sous la marque Aterno). Elle a été
  développée face à une box simulée : vos retours sur du matériel réel sont
  les bienvenus sur le dépôt.
- Elle a été écrite pour la box Eco Aterno. L'ancienne box My Aterno n'a pas
  été testée.
- Les programmations de chauffage (« moments ») restent dans l'application
  Eco Aterno ; construisez les vôtres avec les scènes Gladys si vous
  préférez.
