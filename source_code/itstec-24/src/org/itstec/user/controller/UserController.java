package org.itstec.user.controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import javax.servlet.http.HttpServletRequest;

import org.itstec.base.logging.Log;
import org.itstec.base.logging.LogFactory;
import org.itstec.base.util.DateUtil;
import org.itstec.common.result.R;
import org.itstec.user.entity.User;
import org.itstec.user.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/user")
public class UserController {

	private static Log log = LogFactory.getLog(UserController.class);
	
    @Autowired
    private UserService userService;

    @RequestMapping(value = "/register",method = {RequestMethod.POST})
    public R<?> register(HttpServletRequest request, @RequestBody User user){
        return userService.register(request, user);
    }

    @RequestMapping(value = "/login",method = {RequestMethod.GET,RequestMethod.POST})
    public R<?> login(HttpServletRequest request, String username, String password){
        return userService.login(request,username,password);
    }
    
    @RequestMapping(value = "/loginAutoRedi",method = {RequestMethod.GET,RequestMethod.POST})
    public String loginAutoRedi(HttpServletRequest request, String username, String password, String url){
    	String newUrl =userService.loginAutoRedi(request, username, password, url);
        return "redirect:" + newUrl;
    }
    
    @RequestMapping(value = "/logout",method = {RequestMethod.GET,RequestMethod.POST})
    public R<?> logout(HttpServletRequest request, String username){
        return userService.logout(request,username);
    }
    
    @RequestMapping(value = "/query",method = {RequestMethod.GET,RequestMethod.POST})
    public R<?> query(HttpServletRequest request, String username){
        return userService.query(request,username);
    }
    
    @RequestMapping(value = "/updateInfo",method = {RequestMethod.POST})
    public R<?> updateInfo(@RequestBody User user){
        return userService.updateInfo(user);
    }
    
    @RequestMapping(value = "/uploadImg",method = {RequestMethod.POST})
    public R<?> uploadImg(@RequestParam("file") MultipartFile multifile, @RequestParam("username") String username){
        return userService.uploadImg(multifile,username);
    }
    
    @PostMapping("/updateBatchInfo")
    public String updateBatchInfo(@RequestParam("file") MultipartFile file,
                                   RedirectAttributes redirectAttributes) {
    	String UPLOADED_FOLDER = "/itstec/tmp/";
    	
    	if (file.isEmpty()) {
            redirectAttributes.addFlashAttribute("message", "请上传文件");
            return "redirect:/updateBatchInfo/status";
        }

    	Path path = null;
        try {
            byte[] bytes = file.getBytes();
            path = Paths.get(UPLOADED_FOLDER + DateUtil.getDateTimeStr()+".xlsx");
            Files.write(path, bytes);
            
        } catch (IOException e) {
        	redirectAttributes.addFlashAttribute("message", "文件上传失败");
        	log.error(e.toString());
        	return "redirect:/updateBatchInfo/status";
        }
        
        int i =userService.updateBatchInfo(path.toFile());
        if(i>0){
        	redirectAttributes.addFlashAttribute("message", "更新成功");
        }else{
        	redirectAttributes.addFlashAttribute("message", "更新失败");
        }

        return "redirect:/updateBatchInfo/status";
    }
    
    @RequestMapping(value = "/importBatchInfo",method = {RequestMethod.POST})
    public String importBatchInfo(@RequestParam("file") MultipartFile file, 
    		@RequestParam("memorySize") int memorySize,
    		RedirectAttributes redirectAttributes ){
    	String UPLOADED_FOLDER = "/itstec/tmp/";
    	
    	if (file.isEmpty()) {
            redirectAttributes.addFlashAttribute("message", "请上传文件");
            return "redirect:/updateBatchInfo/status";
        }

    	Path path = null;
        try {
            byte[] bytes = file.getBytes();
            path = Paths.get(UPLOADED_FOLDER + DateUtil.getDateTimeStr()+".xlsx");
            Files.write(path, bytes);
            
        } catch (IOException e) {
        	redirectAttributes.addFlashAttribute("message", "文件上传失败");
        	log.error(e.toString());
        	return "redirect:/updateBatchInfo/status";
        }
        
    	int i = userService.importBatchInfo(path.toFile(),memorySize);
    	if(i>0){
        	redirectAttributes.addFlashAttribute("message", "批量导入成功"+i+"条");
        }else{
        	redirectAttributes.addFlashAttribute("message", "批量导入失败");
        }
        return "redirect:/importBatchInfo/status";
    }
    
}
