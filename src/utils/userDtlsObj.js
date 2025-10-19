import {getUserDtlsWithToken} from "../utils/util.js";

class UserDtlsObj {
  constructor(client, token) {
    this.userPromise = getUserDtlsWithToken(client, token);
    this.user = null;
  }

  async getUser() {
    if(!this.user){
        this.user = await this.userPromise;
    }
    
    if (!this.user) {
      throw new Error("User not found or invalid token");
    }
  return {
      id: this.user.id,
      username: this.user.username,
      email: this.user.email,
      phoneNo: this.user.phoneNo,
      additional_dtls: this.user.additional_dtls,
      profile_image: this.user.profile_image,
    }
  }
}   

export { UserDtlsObj };
