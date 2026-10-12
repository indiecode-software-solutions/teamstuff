<div class="wrap">
	<div class="girl"></div>
	<h1>This is Inspired Fashion <span>.</span></h1>
  <div class="list">
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1495462911434-be47104d70fa?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=675&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1501441858156-e505fb04bfbc?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=666&q=80)"></div>
    </div>
		<button>Buy Now</button>
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1502736842968-bcaab72d0700?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=564&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1495137675798-14250d1e9070?ixlib=rb-1.2.1&auto=format&fit=crop&w=627&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1524401581-85ee6d7d2ccd?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1485014749802-1dba3a03984c?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1503043259787-e75660c42572?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=672&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1472646189317-418747480cd6?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80)"></div>
		</div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1493848015788-45ad0e9f4186?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=717&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1521860908473-fa7dae377c20?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1478604793707-b3a982845b32?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=634&q=80)"></div>
    </div>
		<button>Buy Now</button>		
    <div class="item">
      <div class="img" style="background-image: url(https://images.unsplash.com/photo-1503758425033-cd7b21496e21?ixlib=rb-1.2.1&auto=format&fit=crop&w=634&q=80)"></div>
    </div>
		<button>Buy Now</button>		
  </div>
</div>



*{box-sizing: border-box; -webkit-box-sizing: border-box}
html {
  background: url(https://res.cloudinary.com/malaika/image/upload/v1564327185/parallax-h-img-1_2.jpg) no-repeat center center fixed; 
  -webkit-background-size: cover;
  -moz-background-size: cover;
  -o-background-size: cover;
  background-size: cover;
}
body{
  width: 100%;
  min-height: 100%;
  overflow: hidden;	
}
.wrap{
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  text-align: center;
  -webkit-perspective: 2500px;
  perspective: 2500px;    
  -webkit-perspective-origin: 100% 50%;
  perspective-origin: 100% 50%;
	.girl {
		border:  #fffefe 10px solid;
		background: url("https://res.cloudinary.com/malaika/image/upload/e_grayscale/v1564579524/d7isyf5-137c7a98-d161-496f-9753-f96f530be3be_1.png") no-repeat ;
		margin-left: 0;
		width: 450px;
		height: 600px;
 		bottom: 0%;
		top: 10%;
		position: absolute;
	}
	h1{
		left: -5%;
		transform: rotate(-49deg);
		color: #333;
		font-size: 4em;
		font-family: Raleway, sans-serif;
		top: 25%;
		position: absolute;
		span{
			color: black;
			font-weight: 1000;
		}
	}
  .list{
    width: 80%;
    height: 150vh;
    overflow-x: hidden;
    webkit-transform: rotateX(35deg) rotateY(3deg) rotateZ(27deg);
    transform: rotateX(35deg) rotateY(3deg) rotateZ(27deg);
    margin: 0 0 0 200px;
    padding: 150px 100px 500px 0;
    scrollbar-width: none;
    &::-webkit-scrollbar { 
      display: none; 
    }
    &::-webkit-scrollbar { 
      display: none; 
    }
    &::-webkit-scrollbar { 
      display: block; 
    }
.item{
	
			filter: grayscale(100%);
      width: 30%;
      height: 400px;
      margin: 20px;
      display: inline-block;
      position: relative;
	&::after {
    content: '';
    position: absolute;
    z-index: 150;
    width: 100%;
		top: 0px;
		left: -0px;
    height: 100%;
    background: url("https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/3960c8e1-d90e-4e60-8522-816b41b93892/d84vq6v-5985a860-c6c3-453c-a0ae-e80e5e5abf06.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcLzM5NjBjOGUxLWQ5MGUtNGU2MC04NTIyLTgxNmI0MWI5Mzg5MlwvZDg0dnE2di01OTg1YTg2MC1jNmMzLTQ1M2MtYTBhZS1lODBlNWU1YWJmMDYucG5nIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.G2ljZtN3fPs4NhvF-fCGxl_97BA4w8kvt_qGyJH1RNI");
    opacity: .1;
  }
      .img{
        width: 100%;
        height: 100%;
        background-size: cover;
        background-position: center center;
        box-shadow: 1px 1px 50px 0 #000;
        -webkit-transform-origin: 100% 50%;
        -ms-transform-origin: 100% 50%;
        transform-origin: 100% 50%;
        z-index: 10;
        position: relative;
        
			}
		}
  }
}
button{
	border: 2px solid black;
	padding: 10px;
	z-index:9999;
	top:-300px;
	position: relative;
	display: inline;
	margin-left:-60px;
	outline: none;
}
@media only screen and (max-width: 768px) {
  .girl{  background:url(https://res.cloudinary.com/malaika/image/upload/v1564328867/Gabriella-Wilde-PNG-HD_1_2.png) no-repeat cover fixed; 
  }
	h1{
		display:none;
	}
}
