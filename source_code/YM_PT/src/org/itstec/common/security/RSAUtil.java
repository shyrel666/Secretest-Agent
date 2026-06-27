package org.itstec.common.security;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import javax.crypto.Cipher;

public class RSAUtil {
	
    private static PublicKey getPublicKey(String base64PublicKey) throws Exception {
        byte[] keyBytes = Base64.getDecoder().decode(base64PublicKey);
        X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePublic(spec);
    }

    private static PrivateKey getPrivateKey(String base64PrivateKey) throws Exception {
        byte[] keyBytes = Base64.getDecoder().decode(base64PrivateKey);
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePrivate(spec);
    }
    
    public static String sign(String data, String privateKey) throws Exception {
    	PrivateKey privKey = getPrivateKey(privateKey);
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(privKey);
        signature.update(data.getBytes(StandardCharsets.UTF_8));
        byte[] signedBytes = signature.sign();
        return Base64.getEncoder().encodeToString(signedBytes);
    }
    
    public static String encrypt(String text, String publicKey) throws Exception {
    	PublicKey publKey = getPublicKey(publicKey);   	
    	Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, publKey);
        byte[] cipherText = cipher.doFinal(text.getBytes());
        return Base64.getEncoder().encodeToString(cipherText);    
    }
    
    public static String decrypt(String text, String privateKey) throws Exception {
    	PrivateKey privkey  = getPrivateKey(privateKey);
    	Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.DECRYPT_MODE, privkey);
        byte[] cipherText = Base64.getDecoder().decode(text);
        return new String(cipher.doFinal(cipherText));
    }
    
    public static boolean verify(String data, String signature, String publicKey) throws Exception {
    	PublicKey publKey = getPublicKey(publicKey);
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(publKey);
        verifier.update(data.getBytes(StandardCharsets.UTF_8));
        byte[] signatureBytes = Base64.getDecoder().decode(signature);
        return verifier.verify(signatureBytes);
    }
    
}
