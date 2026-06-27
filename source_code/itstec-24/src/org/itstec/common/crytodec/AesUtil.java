package org.itstec.common.crytodec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;


public class AesUtil {

    private static Logger logger = LoggerFactory.getLogger(AesUtil.class);

    /**
     * AES解密
     *
     * @param content  密文
     * @param password 秘钥，必须为16个字符组成
     * @return 明文
     */
    public static String decrypt(String content, String password) {
        try {
            if (StringUtils.isEmpty(content) || StringUtils.isEmpty(password)) {
                return null;
            }

            byte[] encryptByte = Base64.getDecoder().decode(content);
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(password.getBytes(), "AES"));
            byte[] decryptBytes = cipher.doFinal(encryptByte);
            return new String(decryptBytes);
        } catch (Exception e) {
            logger.error(e.getMessage(), e);
            return null;
        }
    }

    /**
     * AES加密
     *
     * @param content  明文
     * @param password 秘钥，必须为16个字符组成
     * @return 密文
     */
    public static String encrypt(String content, String password) {
        try {
            if (StringUtils.isEmpty(content) || StringUtils.isEmpty(password)) {
                return null;
            }
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(password.getBytes(), "AES"));

            byte[] encryptStr = cipher.doFinal(content.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(encryptStr);
        } catch (Exception e) {
            logger.error(e.getMessage(), e);
            return null;
        }
    }
}
