import crypto from 'crypto'

const algorithm = 'aes-256-ctr';

export const encrypt = (text:string, secretKey:crypto.CipherKey) => {

	let iv = crypto.randomBytes(16);
	
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
};

export const decrypt = (hash:any, secretKey:crypto.CipherKey) => {

    const decipher:crypto.Decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(hash.iv, 'hex'));

    const decrypted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);

    return decrypted.toString();
};