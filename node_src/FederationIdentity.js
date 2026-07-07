'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class FederationIdentity {
    #identity;

    constructor(dataDir) {
        this.identityPath = path.join(dataDir, 'federation_identity.json');
        this.#identity = this._loadOrCreate();
    }

    _loadOrCreate() {
        if (fs.existsSync(this.identityPath)) {
            return JSON.parse(fs.readFileSync(this.identityPath, 'utf8'));
        }
        return this._generate();
    }

    _generate() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });
        const identity = {
            serverId: crypto.randomUUID(),
            publicKey: publicKey.toString('base64'),
            privateKey: privateKey.toString('base64')
        };
        fs.writeFileSync(this.identityPath, JSON.stringify(identity, null, 2));
        return identity;
    }

    rotate() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });
        this.#identity = {
            serverId: this.#identity.serverId,
            publicKey: publicKey.toString('base64'),
            privateKey: privateKey.toString('base64')
        };
        fs.writeFileSync(this.identityPath, JSON.stringify(this.#identity, null, 2));
    }

    get serverId() { return this.#identity.serverId; }
    get publicKey() { return this.#identity.publicKey; }

    sign(data) {
        const privKey = crypto.createPrivateKey({
            key: Buffer.from(this.#identity.privateKey, 'base64'),
            format: 'der', type: 'pkcs8'
        });
        return crypto.sign(null, Buffer.from(data), privKey).toString('base64');
    }

    static verify(publicKeyBase64, data, signatureBase64) {
        try {
            const pubKey = crypto.createPublicKey({
                key: Buffer.from(publicKeyBase64, 'base64'),
                format: 'der', type: 'spki'
            });
            return crypto.verify(null, Buffer.from(data), pubKey, Buffer.from(signatureBase64, 'base64'));
        } catch (e) {
            return false;
        }
    }
}

module.exports = FederationIdentity;
