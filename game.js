class Game {

    constructor(config = {}) {
        this.phaserConfig = {
            type: Phaser.AUTO,
            parent: config.id,
            width: config.width ? config.width : 800,
            height: config.height ? config.height: 600,
            scene: {
                key: "default",
                init: this.initScene,
                create: this.createScene,
                update: this.updateScene
            }
        };
        // const game = new Phaser.Game(this.phaserConfig);

        this.client = stitch.Stitch.initializeDefaultAppClient(config.realmAppId);
        this.database = this.client.getServiceClient(stitch.RemoteMongoClient.factory, "mongodb-atlas").db(config.databaseName);
        this.collection = this.database.collection(config.collectionName);
    }

    initScene(data) {
        this.isDrawing = false;
        this.collection = data.collection;
        this.gameId = data.gameId;
        this.authId = data.authId;
        this.ownerId = data.ownerId;
        this.strokes = data.strokes;
    }

    async createScene() {
        this.graphics = this.add.graphics();
        this.graphics.lineStyle(4, 0x00FFFF);
        this.strokes.forEach(stroke => {
            this.path = new Phaser.Curves.Path();
            this.path.fromJSON(stroke);
            this.path.draw(this.graphics);
        });
        const stream = await this.collection.watch({
            "fullDocument_id" : this.gameId
        });
        stream.onNext(event => {
            let updatedFields = event.updateDescription.updatedFields;
            // if(updatedFields.hasOwnProperty("strokes")) {}
            for (let strokeWithNumber in updatedFields) {
                let changeStreamPath = new Phaser.Curves.Path();
                changeStreamPath.fromJSON(updatedFields[strokeWithNumber]);
                changeStreamPath.draw(this.graphics);
            }
        });
    }

    updateScene() {
        if(!this.input.activePointer.isDown && this.isDrawing) {
            console.log(this.isDrawing);
            this.collection.updateOne(
                {
                    "_id" : this.gameId,
                    "owner_id" : this.authId
                },
                {
                    "$push": {
                        "strokes": this.path.toJSON()
                    }
                }
            ).then(result => console.log(result), error => console.error(error));
            this.isDrawing = false;
        } else if (this.input.activePointer.isDown) {
            if (!this.isDrawing) {
                this.path = new Phaser.Curves.Path(
                    this.input.activePointer.position.x - 2,
                    this.input.activePointer.position.y - 2
                );
                this.isDrawing = true;
            } else {
                this.path.lineTo(
                    this.input.activePointer.position.x - 2,
                    this.input.activePointer.position.y - 2
                );
            }
            this.path.draw(this.graphics);
        }
    }

    async authenticate() {
        return this.client.auth.loginWithCredential(new stitch.AnonymousCredential());
    }

    async createOrJoin(id) {
        try {   
            let auth = await this.authenticate();
            //console.log(auth);
            let result = await this.joinGame(id, auth.id);
            if(result == null) {
                result = this.createGame(id, auth.id);
            }
            return result;
        } catch (e) {
            console.error(e);
        }
    }

    async joinGame(id, authId) {
        try {
            let result = await this.collection.findOne({"_id" : id})
            if (result != null) {
                this.game = new Phaser.Game(this.phaserConfig);
                this.game.scene.start("default", {
                    "gameId" : id,
                    "collection" : this.collection,
                    "authId" : authId,
                    "ownerId" : result.owner_id,
                    "strokes" : result.strokes
                });
            }
            return result;
        } catch(e) {
            console.error(error);
        }
    }

    async createGame(id, authId) {
        try {
            let game = await this.collection.insertOne({
                "_id" : id,
                "owner_id" : authId,
                "strokes" : []
            });
            this.game = new Phaser.Game(this.phaserConfig);
            this.game.scene.start("default", {
                "gameId" : id,
                "collection" : this.collection,
                "authId" : authId,
                "ownertId" : authId,
                "strokes" : []
            });
        } catch(e) {
            console.error(e);
        }
    }
}