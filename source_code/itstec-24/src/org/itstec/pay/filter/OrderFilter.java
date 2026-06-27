package org.itstec.pay.filter;

import org.itstec.common.crytodec.AesUtil;
import org.itstec.common.crytodec.CryptoDecryptionSignSecurity;
import org.itstec.common.crytodec.DecryptionRequestUtil;
import org.itstec.common.json.JsonUtil;
import org.itstec.common.result.R;
import org.itstec.common.sign.SignUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.BeanFactoryUtils;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotationAwareOrderComparator;
import org.springframework.util.StringUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerExecutionChain;
import org.springframework.web.servlet.HandlerMapping;

import javax.servlet.*;
import javax.servlet.annotation.WebFilter;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;


@WebFilter(urlPatterns = { "/order/*" }, filterName = "OrderFilter")
public class OrderFilter implements Filter{

    private static Logger logger = LoggerFactory.getLogger(SignUtils.class);

    //方法映射集
    private List<HandlerMapping> handlerMappings;

    public OrderFilter(ApplicationContext applicationContext) {
        Map<String, HandlerMapping> matchingBeans = BeanFactoryUtils.beansOfTypeIncludingAncestors(applicationContext,
                HandlerMapping.class, true, false);
        if (!matchingBeans.isEmpty()) {
            this.handlerMappings = new ArrayList<>(matchingBeans.values());
            AnnotationAwareOrderComparator.sort(this.handlerMappings);
        }
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpServletRequest = (HttpServletRequest) request;
        HttpServletResponse httpServletResponse = (HttpServletResponse) response;

        //判断方法上是否存在注解，如果不存在，默认加解密
        //类上的注解
        CryptoDecryptionSignSecurity classFlag = null;
        //方法上的注解
        CryptoDecryptionSignSecurity methodFlag = null;

        try {
            HandlerExecutionChain handlerExecutionChain = getHandler(httpServletRequest);
            Object handler = handlerExecutionChain != null ? handlerExecutionChain.getHandler() : null;
            if (handler instanceof HandlerMethod) {
                HandlerMethod method = (HandlerMethod) handler;
                classFlag = method.getBeanType().getAnnotation(CryptoDecryptionSignSecurity.class);
                methodFlag = method.getMethodAnnotation(CryptoDecryptionSignSecurity.class);

                //如果方法注解存在，且不加密，则直接返回
                if (methodFlag != null && !methodFlag.cryptoDecryption()) {
                    chain.doFilter(request, response);
                    return;
                }

                //如果类注解存在，且不加密，则直接返回
                if (classFlag != null && !classFlag.cryptoDecryption()) {
                    chain.doFilter(request, response);
                    return;
                }
            }
        } catch (Exception e) {
            response.setContentType("application/json; charset=UTF-8");
            R r = R.code("901","请求异常，解密失效。");
            response.getWriter().write("{\"code\":\"" + r.getCode() + "\",\"msg\":\"" + r.getMsg() + "\"}");
            return;
        }

        CryptoDecryptionSignSecurity currentFlag = null;

        if (methodFlag != null) {
            currentFlag = methodFlag;
        } else if (classFlag != null) {
            currentFlag = classFlag;
        }

        ResponseWrapperUtil responseWrapper = null;
        String password = "CTGYUwnw";
        if(currentFlag == null){
            // 无需加解密
            chain.doFilter(request, response);
        }else{
            ServletRequest requestWrapper = request;
            // 是否需要对请求参数解密
            if(currentFlag.requestDecryption()){
                requestWrapper = new DecryptionRequestUtil(httpServletRequest, password);
            }
            // 是否需要对请求参数验签
            if(currentFlag.requestSign()){
                Map<String,String[]> paramMap = requestWrapper.getParameterMap();
                String sign = paramMap.get("sign") != null ? paramMap.get("sign")[0] : null;
                if(StringUtils.isEmpty(sign)){
                    R r = R.code("902","请求失败，未对参数签名。");
                    this.getResult(response,r);
                    return;
                }
                String sysSign = SignUtils.signB(paramMap,password);
                if(!sign.equals(sysSign)){
                    R r = R.code("903","请求失败，参数签名验证失败。");
                    this.getResult(response,r);
                    return;
                }
            }
            // 是否需要对返回参数进行加密
            if(currentFlag.responseCrypto()){
                responseWrapper = new ResponseWrapperUtil(httpServletResponse);
            }
            if(responseWrapper == null){
                chain.doFilter(requestWrapper, response);
            }else{
                chain.doFilter(requestWrapper, responseWrapper);
            }
        }

        if (responseWrapper != null) {
            byte[] content = responseWrapper.getContent();//获取返回值
            //判断是否有值
            if(content.length <= 0){
                return;
            }
            String result = new String(content, "UTF-8");
            //把返回值输出到客户端
            ServletOutputStream out = response.getOutputStream();
            Map<String,Object> resultMap = JsonUtil.toMap(result);
            if(resultMap.get("data") == null){
                out.write(result.getBytes());
                out.flush();
                return;
            }
            Map<String,String> dataMap = JsonUtil.parse(JsonUtil.toJson(resultMap.get("data")),Map.class);
            Map<String,String> dataMapNew = new HashMap<>();
            // 加签
            if(currentFlag.responseSign()){
                if(currentFlag.partialCrySign() != null && currentFlag.partialCrySign().length > 0){
                    for(String str : currentFlag.partialCrySign()){
                        dataMapNew.put(str,dataMap.get(str));
                    }
                    dataMap.put("sign",SignUtils.signA(dataMapNew,password));
                }else{
                    dataMap.put("sign",SignUtils.signA(dataMap,password));
                }
            }
            // 加密
            String encryptStr = null;
            if(currentFlag.partialCrySign() != null && currentFlag.partialCrySign().length > 0){
                for(Map.Entry<String,String> map : dataMapNew.entrySet()){
                    dataMap.put(map.getKey(),AesUtil.encrypt(map.getValue(), password));
                }
                encryptStr = JsonUtil.toJson(dataMap);
            }else{
                encryptStr = AesUtil.encrypt(JsonUtil.toJson(dataMap), password);
            }
            R r = R.data(encryptStr);
            out.write(JsonUtil.toJson(r).getBytes());
            out.flush();
        }
    }

    private void getResult(ServletResponse response,R r) throws IOException {
        response.setContentType("application/json; charset=UTF-8");
        String result = "{\"code\":\"" + r.getCode() + "\",\"msg\":\"" + r.getMsg() + "\"}";
        response.getWriter().write(result);
    }


    /**
     * 获取访问目标方法
     *
     * @param request
     * @return HandlerExecutionChain
     * @throws Exception
     */
    private HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception {
        if (this.handlerMappings != null) {
            for (HandlerMapping hm : this.handlerMappings) {
                HandlerExecutionChain handler = hm.getHandler(request);
                if (handler != null) {
                    return handler;
                }
            }
        }
        return null;
    }
}
