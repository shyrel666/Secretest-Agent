package org.itstec.log.controller;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.itstec.common.result.R;
import org.itstec.log.service.LogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/log")
public class LogController {
	
	private static Logger log= LogManager.getLogger(LogController.class);
	
    @Autowired
    private LogService logService;

    @RequestMapping(value = "/show",method = {RequestMethod.POST})
    public R<?> show(String logPath){
        return logService.show(logPath);
    }

    @RequestMapping(value = "/logGrab",method = {RequestMethod.POST})
    public R<?> logGrab(String logPath){
        return logService.logGrab(logPath);
    }
    
    @RequestMapping(value = "/logQuickArch",method = {RequestMethod.POST})
    public R<?> logQuickArch(){
        return logService.logQuickArch();
    }
    
    @RequestMapping(value = "/logArch",method = {RequestMethod.POST})
    public R<?> logArch(String para){
    	log.info("logArch:{}",para);
        return logService.logArch(para);
    }
    	
}
