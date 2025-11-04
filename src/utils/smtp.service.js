import nodemailer from 'nodemailer'

class SmtpService{
    constructor(){
        this.transporter=nodemailer.createTransport({
            host:process.env.SMTP_HOST,
            port:process.env.SMTP_PORT,
            secure:process.env.SMTP_SECURE==='true',
            auth:{
                user:process.env.SMTP_USER,
                pass:process.env.SMTP_PASS
            }
        })
    }

    async sendMail ({from, to, subject, text, html}) {
        if(!to || !subject || (!text && !html)){
            throw new Error("Missing required fields to send email");
        }
        const mailOptions = {
            from: from || process.env.FROM_EMAIL, to, subject, text, html
        };
        return await this.transporter.sendMail(mailOptions);
    }

}

export {SmtpService};